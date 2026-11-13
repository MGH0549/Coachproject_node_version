import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
const root = resolve(__dirname, '../src');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : [],
  );
}
it('keeps domain independent and application dependencies pointing inward', () => {
  const failures: string[] = [];
  for (const layer of ['domain', 'application'])
    for (const file of files(join(root, layer))) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      function check(node: ts.Node) {
        const specifier =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isCallExpression(node) &&
                (node.expression.getText(source) === 'require' ||
                  node.expression.kind === ts.SyntaxKind.ImportKeyword)
              ? node.arguments[0]
              : undefined;
        if (specifier && ts.isStringLiteral(specifier)) {
          const ref = specifier.text;
          if (!ref.startsWith('.'))
            failures.push(`${relative(root, file)} imports ${ref}`);
          else {
            const target = relative(root, resolve(file, '..', ref)).replaceAll(
              '\\',
              '/',
            );
            if (!(
              target.startsWith(`${layer}/`) ||
              (layer === 'application' && target.startsWith('domain/'))
            ))
              failures.push(`${relative(root, file)} imports ${target}`);
          }
        }
        ts.forEachChild(node, check);
      }
      check(source);
    }
  expect(failures).toEqual([]);
});
