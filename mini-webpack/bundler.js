const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const babel = require('@babel/core')

let ID = 0

/**
 * 分析文件依赖
 * @param {string} filename 
 */
function createAsset(filename) {
  const id = ID++;
  const dependencies = [] // 依赖关系数组
  const content = fs.readFileSync(filename, 'utf-8')
  const ast = parser.parse(content, {
    sourceType: 'module'
  })
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    }
  })
  // 将代码转换为es5
  const { code } = babel.transformFromAstSync(ast, null, {
    presets: ["@babel/preset-env"]
  })

  return {
    id,
    filename,
    dependencies,
    code
  }
}

/**
 * 从入口开始分析所有依赖项，形成依赖图，采用广度遍历
 * @param {string} entry 打包文件入口
 */
function createGraph(entry) {
  const mainAsset = createAsset(entry)
  const queue = [mainAsset]
  for (const asset of queue) {
    const dirname = path.dirname(asset.filename)
    // mapping 存储当前文件依赖map
    asset.mapping = {}
    asset.dependencies.forEach(relativePath => {
      const absolutePath = path.join(dirname, relativePath)
      const child = createAsset(absolutePath)
      asset.mapping[relativePath] = child.id
      queue.push(child)
    })
  }
  return queue
}

/**
 * 根据生成的依赖关系图，生成对应环境能执行的代码，目前是生产浏览器可以执行的
 * @param {array} graph 
 */
function bundle(graph) {
  let modules = ''
  graph.forEach(mod => {
    modules += `${mod.id}:[
      function (require, module, exports){
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ],`
  })

  //require, module, exports 是 cjs的标准不能再浏览器中直接使用，所以这里模拟cjs模块加载，执行，导出操作。
  const result = `
    (function(modules){
      //创建require函数， 它接受一个模块ID（这个模块id是数字0，1，2） ，它会在我们上面定义 modules 中找到对应是模块.
      function require(id){
        const [fn, mapping] = modules[id]
        function localRequire(relativePath){
          //根据模块的路径在mapping中找到对应的模块id
          return require(mapping[relativePath]);
        }
        const module = {exports:{}};
        //执行每个模块的代码。
        fn(localRequire,module,module.exports);
        return module.exports;
      }
      //执行入口文件，
      require(0);
    })({${modules}})
  `

  return result
}

const graph = createGraph("./example/index.js")
console.log(graph)
const ret = bundle(graph)

// 打包生成文件
fs.writeFileSync("./bundle.js", ret)