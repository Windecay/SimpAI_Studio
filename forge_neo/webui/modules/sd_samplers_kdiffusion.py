import inspect
import time

import k_diffusion
import k_diffusion.external
import torch

import modules.shared as shared
from backend.sampling.sampling_function import sampling_cleanup, sampling_prepare
from modules import devices, sd_samplers_cfg_denoiser, sd_samplers_common, sd_samplers_extra, sd_schedulers
from modules.script_callbacks import ExtraNoiseParams, extra_noise_callback
from modules.sd_samplers_cfg_denoiser import CFGDenoiser  # noqa: F401
from modules.shared import opts
from modules.source_backend_timing import log_source_stage, log_source_stage_marker

samplers_k_diffusion = [
    ("DPM++ 2M", "sample_dpmpp_2m", ["k_dpmpp_2m"], {"scheduler": "karras"}),
    ("DPM++ SDE", "sample_dpmpp_sde", ["k_dpmpp_sde"], {"scheduler": "karras", "second_order": True, "brownian_noise": True}),
    ("DPM++ 2M SDE", "sample_dpmpp_2m_sde", ["k_dpmpp_2m_sde"], {"scheduler": "exponential", "brownian_noise": True}),
    ("DPM++ 3M SDE", "sample_dpmpp_3m_sde", ["k_dpmpp_3m_sde"], {"scheduler": "exponential", "discard_next_to_last_sigma": True, "brownian_noise": True}),
    ("Flux Realistic" if opts.forbidden_knowledge else "DPM++ 2s a RF", "sample_dpmpp_2s_ancestral_RF", ["sample_dpmpp_2s_ancestral_RF"], {}),
    ("Euler a", "sample_euler_ancestral", ["k_euler_a", "k_euler_ancestral"], {"uses_ensd": True}),
    ("Euler", "sample_euler", ["k_euler"], {}),
    ("ER SDE", "sample_er_sde", ["er_sde"], {}),
    ("LCM", "sample_lcm", ["k_lcm"], {}),
    ("LMS", "sample_lms", ["k_lms"], {}),
    ("Heun", "sample_heun", ["k_heun"], {"second_order": True}),
    ("DPM2", "sample_dpm_2", ["k_dpm_2"], {"scheduler": "karras", "discard_next_to_last_sigma": True, "second_order": True}),
    ("Res Multistep", "sample_res_multistep", ["res_multistep"], {}),
    ("Kohaku LoNyu Yog", "sample_Kohaku_LoNyu_Yog", ["Kohaku_LoNyu_Yog"], {}),
    ("Restart", sd_samplers_extra.restart_sampler, ["restart"], {"scheduler": "karras", "second_order": True}),
    ("UniPC", sd_samplers_extra.sample_unipc, ["unipc"], {"discard_next_to_last_sigma": True}),
]


samplers_data_k_diffusion = [sd_samplers_common.SamplerData(label, lambda model, funcname=funcname: KDiffusionSampler(funcname, model), aliases, options) for label, funcname, aliases, options in samplers_k_diffusion if callable(funcname) or hasattr(k_diffusion.sampling, funcname)]

sampler_extra_params = {
    "sample_dpmpp_sde": ["eta", "s_noise", "r"],
    "sample_dpmpp_2m_sde": ["eta", "s_noise"],
    "sample_dpmpp_3m_sde": ["eta", "s_noise"],
    "sample_euler_ancestral": ["eta", "s_noise"],
    "sample_euler": ["s_churn", "s_tmin", "s_tmax", "s_noise"],
    "sample_heun": ["s_churn", "s_tmin", "s_tmax", "s_noise"],
    "sample_dpm_2": ["s_churn", "s_tmin", "s_tmax", "s_noise"],
}

k_diffusion_samplers_map = {x.name: x for x in samplers_data_k_diffusion}
k_diffusion_scheduler = {x.name: x.function for x in sd_schedulers.schedulers}


class CFGDenoiserKDiffusion(sd_samplers_cfg_denoiser.CFGDenoiser):
    @property
    def inner_model(self):
        if self.model_wrap is None:
            self.model_wrap = k_diffusion.external.ForgeScheduleLinker(shared.sd_model.forge_objects.unet.model.predictor)
            self.model_wrap.inner_model = shared.sd_model

        return self.model_wrap


class KDiffusionSampler(sd_samplers_common.Sampler):
    def __init__(self, funcname, sd_model, options=None):
        super().__init__(funcname)

        self.extra_params = sampler_extra_params.get(funcname, [])

        self.options = options or {}
        self.func = funcname if callable(funcname) else getattr(k_diffusion.sampling, self.funcname)

        self.model_wrap_cfg = CFGDenoiserKDiffusion(self)
        self.model_wrap = self.model_wrap_cfg.inner_model

    def get_sigmas(self, p, steps):
        discard_next_to_last_sigma = self.config is not None and self.config.options.get("discard_next_to_last_sigma", False)
        if opts.always_discard_next_to_last_sigma and not discard_next_to_last_sigma:
            discard_next_to_last_sigma = True
            p.extra_generation_params["Discard penultimate sigma"] = True

        steps += 1 if discard_next_to_last_sigma else 0

        scheduler_name = (p.hr_scheduler if p.is_hr_pass else p.scheduler) or "Automatic"
        if scheduler_name == "Automatic":
            from backend.args import dynamic_args

            if dynamic_args.klein:
                scheduler_name = "Flux2"
            else:
                scheduler_name = self.config.options.get("scheduler", None)

            if scheduler_name is None and not p.sd_model.is_webui_legacy_model():
                scheduler_name = "Normal"

        scheduler = sd_schedulers.schedulers_map.get(scheduler_name)

        m_sigma_min, m_sigma_max = self.model_wrap.sigmas[0].item(), self.model_wrap.sigmas[-1].item()

        if p.sampler_noise_scheduler_override:
            sigmas = p.sampler_noise_scheduler_override(steps)
        elif scheduler is None or scheduler.function is None:
            sigmas = self.model_wrap.get_sigmas(steps)
        else:
            sigmas_kwargs = {"sigma_min": m_sigma_min, "sigma_max": m_sigma_max}

            if scheduler.label != "Automatic" and not p.is_hr_pass:
                p.extra_generation_params["Schedule type"] = scheduler.label
            elif scheduler.label != p.extra_generation_params.get("Schedule type"):
                p.extra_generation_params["Hires schedule type"] = scheduler.label

            if opts.sigma_min != 0 and opts.sigma_min != m_sigma_min:
                sigmas_kwargs["sigma_min"] = opts.sigma_min
                p.extra_generation_params["Schedule min sigma"] = opts.sigma_min
            if opts.sigma_max != 0 and opts.sigma_max != m_sigma_max:
                sigmas_kwargs["sigma_max"] = opts.sigma_max
                p.extra_generation_params["Schedule max sigma"] = opts.sigma_max

            if scheduler.default_rho != -1 and opts.rho != 0 and opts.rho != scheduler.default_rho:
                sigmas_kwargs["rho"] = opts.rho
                p.extra_generation_params["Schedule rho"] = opts.rho

            if scheduler.need_inner_model:
                sigmas_kwargs["inner_model"] = self.model_wrap

            if scheduler.label == "Beta":
                p.extra_generation_params["Beta schedule alpha"] = opts.beta_dist_alpha
                p.extra_generation_params["Beta schedule beta"] = opts.beta_dist_beta

            if scheduler.label == "Flux2":
                if p.is_hr_pass:
                    sigmas_kwargs["width"] = p.hr_upscale_to_x
                    sigmas_kwargs["height"] = p.hr_upscale_to_y
                else:
                    sigmas_kwargs["width"] = p.width
                    sigmas_kwargs["height"] = p.height

            sigmas = scheduler.function(n=steps, **sigmas_kwargs, device=devices.cpu)

        if discard_next_to_last_sigma:
            sigmas = torch.cat([sigmas[:-2], sigmas[-1:]])

        return sigmas.cpu()

    def sample_img2img(self, p, x, noise, conditioning, unconditional_conditioning, steps=None, image_conditioning=None):
        unet_patcher = self.model_wrap.inner_model.forge_objects.unet

        log_source_stage_marker("kdiffusion.img2img.sampling_prepare", sampler=self.funcname)
        sampling_prepare_started = time.perf_counter()
        try:
            sampling_prepare(self.model_wrap.inner_model.forge_objects.unet, x=x)
        finally:
            log_source_stage("kdiffusion.img2img.sampling_prepare", sampling_prepare_started, sampler=self.funcname)

        steps, t_enc = sd_samplers_common.setup_img2img_steps(p, steps)

        log_source_stage_marker("kdiffusion.img2img.sigmas", sampler=self.funcname, steps=steps)
        sigmas_started = time.perf_counter()
        try:
            sigmas = self.get_sigmas(p, steps).to(x.device)
        finally:
            log_source_stage("kdiffusion.img2img.sigmas", sigmas_started, sampler=self.funcname, steps=steps)
        sigma_sched = sigmas[steps - t_enc - 1 :]

        x = x.to(noise)

        log_source_stage_marker("kdiffusion.img2img.noise_scaling", sampler=self.funcname)
        noise_scaling_started = time.perf_counter()
        try:
            xi = self.model_wrap.predictor.noise_scaling(sigma_sched[0], noise, x, max_denoise=False)
        finally:
            log_source_stage("kdiffusion.img2img.noise_scaling", noise_scaling_started, sampler=self.funcname)

        if opts.img2img_extra_noise > 0:
            p.extra_generation_params["Extra noise"] = opts.img2img_extra_noise
            extra_noise_params = ExtraNoiseParams(noise, x, xi)
            extra_noise_callback(extra_noise_params)
            noise = extra_noise_params.noise
            xi += noise * opts.img2img_extra_noise

        log_source_stage_marker("kdiffusion.img2img.initialize", sampler=self.funcname)
        initialize_started = time.perf_counter()
        try:
            extra_params_kwargs = self.initialize(p)
        finally:
            log_source_stage("kdiffusion.img2img.initialize", initialize_started, sampler=self.funcname)
        parameters = inspect.signature(self.func).parameters

        if "sigma_min" in parameters:
            ## last sigma is zero which isn't allowed by DPM Fast & Adaptive so taking value before last
            extra_params_kwargs["sigma_min"] = sigma_sched[-2]
        if "sigma_max" in parameters:
            extra_params_kwargs["sigma_max"] = sigma_sched[0]
        if "n" in parameters:
            extra_params_kwargs["n"] = len(sigma_sched) - 1
        if "sigma_sched" in parameters:
            extra_params_kwargs["sigma_sched"] = sigma_sched
        if "sigmas" in parameters:
            extra_params_kwargs["sigmas"] = sigma_sched

        if self.config.options.get("brownian_noise", False):
            noise_sampler = self.create_noise_sampler(x, sigmas, p)
            extra_params_kwargs["noise_sampler"] = noise_sampler

        if self.config.options.get("solver_type", None) == "heun":
            extra_params_kwargs["solver_type"] = "heun"

        self.model_wrap_cfg.init_latent = x
        self.last_latent = x
        self.sampler_extra_args = {
            "cond": conditioning,
            "image_cond": image_conditioning,
            "uncond": unconditional_conditioning,
            "cond_scale": p.cfg_scale,
            "s_min_uncond": self.s_min_uncond,
        }

        p.sd_model.forge_objects.unet.model_options["transformer_options"]["sampling_sigmas"] = sigmas

        log_source_stage_marker("kdiffusion.img2img.launch_sampling", sampler=self.funcname, steps=t_enc + 1)
        launch_sampling_started = time.perf_counter()
        try:
            samples = self.launch_sampling(
                t_enc + 1,
                lambda: self.func(self.model_wrap_cfg, xi, extra_args=self.sampler_extra_args, disable=shared.cmd_opts.disable_console_progressbars, callback=self.callback_state, **extra_params_kwargs),
            )
        finally:
            log_source_stage("kdiffusion.img2img.launch_sampling", launch_sampling_started, sampler=self.funcname, steps=t_enc + 1)

        self.add_infotext(p)

        log_source_stage_marker("kdiffusion.img2img.sampling_cleanup", sampler=self.funcname)
        cleanup_started = time.perf_counter()
        try:
            sampling_cleanup(unet_patcher)
        finally:
            log_source_stage("kdiffusion.img2img.sampling_cleanup", cleanup_started, sampler=self.funcname)

        return samples

    def sample(self, p, x, conditioning, unconditional_conditioning, steps=None, image_conditioning=None):
        unet_patcher = self.model_wrap.inner_model.forge_objects.unet

        log_source_stage_marker("kdiffusion.txt2img.sampling_prepare", sampler=self.funcname)
        sampling_prepare_started = time.perf_counter()
        try:
            sampling_prepare(self.model_wrap.inner_model.forge_objects.unet, x=x)
        finally:
            log_source_stage("kdiffusion.txt2img.sampling_prepare", sampling_prepare_started, sampler=self.funcname)

        steps = steps or p.steps

        log_source_stage_marker("kdiffusion.txt2img.sigmas", sampler=self.funcname, steps=steps)
        sigmas_started = time.perf_counter()
        try:
            sigmas = self.get_sigmas(p, steps).to(x.device)
        finally:
            log_source_stage("kdiffusion.txt2img.sigmas", sigmas_started, sampler=self.funcname, steps=steps)

        if opts.sgm_noise_multiplier:
            p.extra_generation_params["SGM noise multiplier"] = True

        log_source_stage_marker("kdiffusion.txt2img.noise_scaling", sampler=self.funcname)
        noise_scaling_started = time.perf_counter()
        try:
            x = self.model_wrap.predictor.noise_scaling(sigmas[0], x, torch.zeros_like(x), max_denoise=opts.sgm_noise_multiplier)
        finally:
            log_source_stage("kdiffusion.txt2img.noise_scaling", noise_scaling_started, sampler=self.funcname)

        log_source_stage_marker("kdiffusion.txt2img.initialize", sampler=self.funcname)
        initialize_started = time.perf_counter()
        try:
            extra_params_kwargs = self.initialize(p)
        finally:
            log_source_stage("kdiffusion.txt2img.initialize", initialize_started, sampler=self.funcname)
        parameters = inspect.signature(self.func).parameters

        if "n" in parameters:
            extra_params_kwargs["n"] = steps

        if "sigma_min" in parameters:
            extra_params_kwargs["sigma_min"] = self.model_wrap.sigmas[0].item()
            extra_params_kwargs["sigma_max"] = self.model_wrap.sigmas[-1].item()

        if "sigmas" in parameters:
            extra_params_kwargs["sigmas"] = sigmas

        if self.config.options.get("brownian_noise", False):
            noise_sampler = self.create_noise_sampler(x, sigmas, p)
            extra_params_kwargs["noise_sampler"] = noise_sampler

        if self.config.options.get("solver_type", None) == "heun":
            extra_params_kwargs["solver_type"] = "heun"

        self.last_latent = x
        self.sampler_extra_args = {
            "cond": conditioning,
            "image_cond": image_conditioning,
            "uncond": unconditional_conditioning,
            "cond_scale": p.cfg_scale,
            "s_min_uncond": self.s_min_uncond,
        }

        p.sd_model.forge_objects.unet.model_options["transformer_options"]["sampling_sigmas"] = sigmas

        log_source_stage_marker("kdiffusion.txt2img.launch_sampling", sampler=self.funcname, steps=steps)
        launch_sampling_started = time.perf_counter()
        try:
            samples = self.launch_sampling(
                steps,
                lambda: self.func(self.model_wrap_cfg, x, extra_args=self.sampler_extra_args, disable=shared.cmd_opts.disable_console_progressbars, callback=self.callback_state, **extra_params_kwargs),
            )
        finally:
            log_source_stage("kdiffusion.txt2img.launch_sampling", launch_sampling_started, sampler=self.funcname, steps=steps)

        self.add_infotext(p)

        log_source_stage_marker("kdiffusion.txt2img.sampling_cleanup", sampler=self.funcname)
        cleanup_started = time.perf_counter()
        try:
            sampling_cleanup(unet_patcher)
        finally:
            log_source_stage("kdiffusion.txt2img.sampling_cleanup", cleanup_started, sampler=self.funcname)

        return samples
