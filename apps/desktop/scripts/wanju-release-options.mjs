import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export function wanjuReleaseOptions(args, defaultOutputParent) {
  const { values } = parseArgs({ args, options: {
    version: { type: 'string', default: '2.1.0' },
    output: { type: 'string' },
    'skip-ui-build': { type: 'boolean', default: false },
    'bundle-browser': { type: 'boolean', default: false },
    teacher: { type: 'boolean', default: false },
    signing: { type: 'string', default: 'none' },
  } });
  const version = values.version;
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/.test(version)
    || version.split('-')[0].split('.').some((part) => Number(part) > 65535)) throw new Error('Invalid Wanju version.');
  if (values.output !== undefined && !values.output.trim()) throw new Error('Build output must not be empty.');
  if (!['none', 'signpath'].includes(values.signing)) throw new Error('Signing must be none or signpath.');
  return {
    version,
    output: resolve(values.output || join(defaultOutputParent, `桌面版-${version}`)),
    skipUiBuild: values['skip-ui-build'],
    bundleBrowser: values['bundle-browser'],
    signing: values.signing,
  };
}
