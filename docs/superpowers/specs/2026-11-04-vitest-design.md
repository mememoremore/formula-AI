# Vitest 接入设计（2026-11-04）

用户已确认：迁移纯逻辑单测，补Vue组件交互测试、覆盖率并接入现有CI；集成与Playwright保留。

使用Vitest5.1与匹配coverage-v8，Vue Test Utils、happy-dom与Vite Vue插件作为开发依赖。Node项目执行既有纯逻辑测试，组件项目使用DOM环境且只挂载独立组件。组件显式导入Vue组合式API，装饰子组件stub；不启动Nuxt服务器或连接数据库。测试文件白名单防止Vitest误发现node:test集成、E2E和生产环境脚本。

Node运行器保留基础设施测试：test-environment、ci-policy、node-forge、public-assets。Vitest复用已有测试环境清洗与网络守卫，保留防误连开发数据库/公网的安全默认。原纯逻辑测试只替换运行器导入，保留断言与用例数。

覆盖率范围明确为前端工具、shared业务工具及选定组件；生成文本、HTML和JSON摘要，不宣称为整个服务端覆盖率。初期不设置任意全局覆盖率门槛，优先报告未覆盖分支。报告留在忽略的artifacts目录，CI只保留既有安全产物白名单。

npm test/test:unit同时执行保留的Node基础设施测试与Vitest。watch仅运行Vitest；coverage命令只执行Vitest并生成报告。quality:quick新增Vitest覆盖率阶段，保留隔离集成与Playwright。生产Docker仅剪除开发依赖，不添加测试运行时到生产。
