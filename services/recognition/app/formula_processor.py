"""复用固定版本PaddleX的官方处理器，按导出配置完成图片与token转换。"""


class FormulaProcessor:
    def __init__(self, configuration: dict):
        from paddlex.inference.models.formula_recognition.processors import (
            LatexImageFormat,
            ToBatch,
            UniMERNetDecode,
            UniMERNetImgDecode,
            UniMERNetTestTransform,
        )

        if configuration.get("Global", {}).get("model_name") != "PP-FormulaNet_plus-L":
            raise ValueError("当前服务只接受PP-FormulaNet_plus-L导出包。")
        operations = configuration["PreProcess"]["transform_ops"]
        names = [next(iter(operation)) for operation in operations]
        if names != ["UniMERNetImgDecode", "UniMERNetTestTransform", "LatexImageFormat", "UniMERNetLabelEncode", "KeepKeys"]:
            raise ValueError("模型前处理配置已变化，请先验证匹配的处理链。")
        postprocess = configuration["PostProcess"]
        if postprocess["name"] != "UniMERNetDecode":
            raise ValueError("模型解码配置不匹配。")
        self.resize = UniMERNetImgDecode(**operations[0]["UniMERNetImgDecode"])
        self.transform = UniMERNetTestTransform()
        self.format = LatexImageFormat()
        self.batch = ToBatch()
        self.decoder = UniMERNetDecode(character_list=postprocess["character_dict"])

    def prepare(self, image):
        import numpy as np

        # PIL图片已转RGB，与官方ReadImage(format="RGB")的输出一致。
        images = self.resize(imgs=[np.asarray(image)])
        images = self.transform(imgs=images)
        images = self.format(imgs=images)
        return self.batch(imgs=images)[0]

    def decode(self, tokens):
        return self.decoder([row.reshape([-1]) for row in tokens])

