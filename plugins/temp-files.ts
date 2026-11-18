import { type Plugin, tool } from '@kilocode/plugin';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const filenameSchema = tool.schema
  .string()
  .min(1)
  .refine(
    (name) =>
      !/[<>:"/\\|?*]/.test(name) &&
      !name.includes('\0') &&
      !/[. ]$/.test(name) &&
      !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name),
    'Use a filename without folders or reserved path characters.',
  );

export const TempFilesPlugin: Plugin = async () => {
  const root = await mkdtemp(join(tmpdir(), 'kilo-temp-files-'));

  const filePath = async (filename: string, sessionID: string) => {
    const name = filenameSchema.parse(filename);
    const directory = join(root, createHash('sha256').update(sessionID).digest('hex'));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return join(directory, name);
  };

  return {
    tool: {
      temp_read: tool({
        description: 'Read a UTF-8 temporary file from the current session. Pass a filename without folders.',
        args: { filename: filenameSchema },
        async execute({ filename }, { sessionID }) {
          try {
            return await readFile(await filePath(filename, sessionID), 'utf8');
          } catch {
            throw new Error('Could not read the temporary file.');
          }
        },
      }),
      temp_write: tool({
        description:
          'Write a UTF-8 temporary file for the current session. Overwrites an existing file with that name.',
        args: { filename: filenameSchema, content: tool.schema.string() },
        async execute({ filename, content }, { sessionID }) {
          try {
            await writeFile(await filePath(filename, sessionID), content, { encoding: 'utf8', mode: 0o600 });
            return `Wrote ${filename}.`;
          } catch {
            throw new Error('Could not write the temporary file.');
          }
        },
      }),
    },
  };
};
