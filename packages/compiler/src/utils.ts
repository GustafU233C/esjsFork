import * as espree from 'espree'
import prettier from 'prettier/standalone'
import parserBabel from 'prettier/parser-babel'
import escodegen from 'escodegen'
import { obfuscate } from 'javascript-obfuscator'
import type { Options } from 'prettier'
// import { convertCodeToSvg } from '@es-js/esjs2flowchart'
import { splitCodeImports, transpile } from '@es-js/core'
import { MAIN_FILE } from './orchestrator'
import { DEFAULT_IMPORTS, DEFAULT_TESTS_IMPORTS } from './constants'

class PrepareCodeError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(message)
  }
}

export function prepareCode(code: string) {
  try {
    code = transpile(code)
    code = formatCode(code) // TODO: Es necesario?.
    code = addExportToFunctions(code)
    code = addInfiniteLoopProtection(code)
    return code
  }
  catch (error: SyntaxError | any) {
    const errorMessage = error.message
    const line = error?.loc?.start?.line || 1
    const column = error?.loc?.start?.column || 1

    throw new PrepareCodeError(errorMessage, line, column)
  }
}

/**
 * TODO: Eliminar.
 * @param code
 */
export function sanitizeCode(code: string) {
  if (!code.endsWith('\n'))
    code += '\n'

  return code
}

/**
 * Agrega un límite de tiempo de ejecución para cada bucle.
 * @author Ariya Hidayat (versión esprima)
 * @author Enzo Notario (versión espree)
 * @see https://github.com/chinchang/web-maker/blob/master/src/utils.js#L122
 */
export function addInfiniteLoopProtection(code: string, { timeout } = { timeout: 5000 }) {
  let loopId = 1
  const patches = []
  const varPrefix = '_wmloopvar'
  const varStr = 'var %d = Date.now();\n'
  const checkStr = `\nif (Date.now() - %d > ${timeout}) { window._handleInfiniteLoopException(new Error("Bucle infinito")); break;}\n`

  espree.parse(code, {
    range: true,
    ecmaVersion: 'latest',
    jsx: false,
    loc: true,
    tolerant: true,
    sourceType: 'module',
  }).body.forEach((node) => {
    switch (node.type) {
      case 'DoWhileStatement':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
        var start = 1 + node.body.range[0]
        var end = node.body.range[1]
        var prolog = checkStr.replace('%d', varPrefix + loopId)
        var epilog = ''

        if (node.body.type !== 'BlockStatement') {
          // `while(1) doThat()` becomes `while(1) {doThat()}`
          prolog = `{${prolog}`
          epilog = '}'
          --start
        }

        patches.push({
          pos: start,
          str: prolog,
        })
        patches.push({
          pos: end,
          str: epilog,
        })
        patches.push({
          pos: node.range[0],
          str: varStr.replace('%d', varPrefix + loopId),
        })
        ++loopId
        break

      default:
        break
    }
  })

  patches
    .sort((a, b) => {
      return b.pos - a.pos
    })
    .forEach((patch) => {
      code = code.slice(0, patch.pos) + patch.str + code.slice(patch.pos)
    })

  return code
}

/**
 * @author @slevithan
 * @param str
 */
export function escapeQuotes(str) {
  return str.replace(/\\([\s\S])|(")/g, '\\$1$2')
}

export function unifyImports(imports: string) {
  const importMap = new Map()
  let output = ''

  imports.split('\n')
    .map(line => line.trim())
    .forEach((line) => {
      const importMatch = line.match(/^import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]\s*(;)?$/)

      if (!importMatch) {
        output += `${line}\n`
        return
      }

      const [matchedText, namedImports, moduleSpecifier] = importMatch

      if (!importMap.has(moduleSpecifier))
        importMap.set(moduleSpecifier, new Set())

      namedImports.split(/\s*,\s*/g).forEach((namedImport) => {
        importMap.get(moduleSpecifier).add(namedImport.trim())
      })
    })

  importMap.forEach((namedImports, moduleSpecifier) => {
    const sortedImports = [...namedImports].sort()
    output += `import { ${sortedImports.join(', ')} } from '${moduleSpecifier}'\n`
  })

  return output
}

export function formatCode(code: string, options?: Partial<Options>) {
  return prettier.format(code, {
    parser: 'babel',
    plugins: [parserBabel],
    semi: false,
    ...options,
  })
}

export function obfuscateCode(code: string) {
  return obfuscate(code, {
    compact: true,
    simplify: false,
    controlFlowFlattening: false,
    ignoreImports: true,
  })
}

export function escapeTemplateLiteral(code: string) {
  return code.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

export function removeTopLevelAwaits(code: string) {
  const ast = espree.parse(code, {
    range: true,
    ecmaVersion: 'latest',
    jsx: false,
    loc: true,
    tolerant: true,
    sourceType: 'module',
  })

  const topLevelAwaits = ast.body.filter((node) => {
    if (node.type === 'AwaitExpression')
      return true

    if (
      node.type === 'ExpressionStatement'
      && node.expression.type === 'AwaitExpression'
    )
      return true

    return false
  })

  topLevelAwaits.forEach((node) => {
    const index = ast.body.indexOf(node)
    ast.body.splice(index, 1)
  })

  return escodegen.generate(ast)
}

export function getFlowchartSvg(code: string): string {
//   try {
//     return escapeTemplateLiteral(
//       convertCodeToSvg(
//         removeTopLevelAwaits(code),
//       ),
//     )
//   }
//   catch (error) {
//     return `<div class="w-full h-full flex flex-col justify-center items-center text-center text-red-700 text-2xl font-sans">
//     <p>¡Ups!</p>
//     <p>No se pudo generar el Diagrama de Flujo</p>
// </div>`
//   }
}

/**
 * Agrega `export` a las funciones declaradas.
 * @param code
 */
export function addExportToFunctions(code: string) {
  const ast = espree.parse(code, {
    range: true,
    ecmaVersion: 'latest',
    jsx: false,
    loc: true,
    tolerant: true,
    sourceType: 'module',
  })

  ast.body.forEach((node) => {
    if (node.type === 'FunctionDeclaration') {
      // Crear el nodo de exportación
      const exportNode = {
        type: 'ExportNamedDeclaration',
        declaration: node,
        source: null,
        specifiers: [],
      }

      // Reemplazar el nodo de la función con el nodo de exportación
      const index = ast.body.indexOf(node)
      ast.body[index] = exportNode
    }
  })

  return escodegen.generate(ast)
}

/**
 * Genera los imports a partir de las funciones exportadas.
 * @param code
 * @param modulePath
 */
export function generateImportStatement(code: string, modulePath: string) {
  const ast = espree.parse(code, {
    range: true,
    ecmaVersion: 'latest',
    jsx: false,
    loc: true,
    tolerant: true,
    sourceType: 'module',
  })

  const namedExports = ast.body.filter(
    node =>
      node.type === 'ExportNamedDeclaration'
      && node.declaration?.type === 'FunctionDeclaration',
  )

  const imports = namedExports.map(
    node =>
      `import { ${node.declaration?.id?.name} } from '${modulePath}'`,
  )

  return imports.join('\n')
}

export function prepareCodeAndTestsForPlayground(code: string, tests: string) {
  const transpiledCode = transpile(prepareCode(code))
  const splittedCode = splitCodeImports(transpiledCode)
  const imports = unifyImports(`${DEFAULT_IMPORTS} \n ${splittedCode.imports}`)

  const generatedCodeImports = unifyImports(generateImportStatement(splittedCode.codeWithoutImports, `./${MAIN_FILE}`))

  const transpiledTestsCode = transpile(prepareCode(tests))
  const splittedTestsCode = splitCodeImports(transpiledTestsCode)
  const testsImports = unifyImports(`${DEFAULT_TESTS_IMPORTS} \n ${splittedTestsCode.imports} \n ${generatedCodeImports}`)

  return {
    imports,
    code: splittedCode.codeWithoutImports,

    testsImports,
    testsCode: splittedTestsCode.codeWithoutImports,
  }
}