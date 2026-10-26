"""本地导出图的CPU执行器；兼容配置集中维护，不修改第三方包。"""

from pathlib import Path


class PaddleRuntime:
    def __init__(self, model_dir: Path, cpu_threads: int):
        import paddle

        configuration = paddle.inference.Config(
            str(model_dir / "inference.json"),
            str(model_dir / "inference.pdiparams"),
        )
        configuration.disable_gpu()
        configuration.disable_mkldnn()
        # 此导出包含linear_v2，要求3.3.1；默认优化会导致参数流读取失败。
        # 使用原始图执行，不对权重或图文件做任何修改。
        configuration.switch_ir_optim(False)
        configuration.set_optimization_level(0)
        configuration.set_cpu_math_library_num_threads(cpu_threads)
        configuration.disable_glog_info()
        self.predictor = paddle.inference.create_predictor(configuration)
        if self.predictor.get_input_names() != ["x"] or len(self.predictor.get_output_names()) != 1:
            raise RuntimeError("模型输入输出协议与当前公式识别器不匹配。")

    def predict(self, tensor):
        self.predictor.get_input_handle("x").copy_from_cpu(tensor)
        self.predictor.run()
        return self.predictor.get_output_handle(self.predictor.get_output_names()[0]).copy_to_cpu()

