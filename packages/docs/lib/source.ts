import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';

const mdxSource = docs.toFumadocsSource();

export const source = loader({
  baseUrl: '/docs',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: { files: (mdxSource.files as any)() } as any,
});
