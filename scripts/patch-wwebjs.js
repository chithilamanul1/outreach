import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const utilsPath = resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');

if (!existsSync(utilsPath)) {
  console.log('ℹ whatsapp-web.js not found in node_modules, skipping patch.');
  process.exit(0);
}

let content = readFileSync(utilsPath, 'utf8');

if (content.includes('mediaDataFields')) {
  console.log('✅ Utils.js is already patched for media sending memoize fix.');
} else {
  console.log('🔧 Patching whatsapp-web.js for "Data passed to getter must include an id property" fix...');

  // 1. Add mediaDataFields helper function
  const helperCode = `
    // MediaData is a model: its __x_* slots (e.g. __x_id) would overwrite the Msg's own when spread into it
    window.WWebJS.mediaDataFields = (mediaData) => {
        const internals = [
            'revisionNumber',
            'parent',
            'collection',
            '_uiObservers',
            'mirror',
        ];
        return Object.fromEntries(
            Object.entries(mediaData).filter(
                ([key]) => !key.startsWith('__') && !internals.includes(key),
            ),
        );
    };
`;

  content = content.replace(
    'return mediaData;\n    };',
    `return mediaData;\n    };\n${helperCode}`
  );

  // 2. Replace ...mediaOptions with filtered mediaDataFields
  content = content.replace(
    '...mediaOptions,',
    '...(window.WWebJS.mediaDataFields ? window.WWebJS.mediaDataFields(mediaOptions) : mediaOptions),'
  );

  // 3. Ensure message.id is restored and __x_id is deleted after message literal
  content = content.replace(
    'const message = {',
    '/* patched */ const message = {'
  );

  content = content.replace(
    '...extraOptions,\n        };',
    `...extraOptions,\n        };\n        message.id = newMsgKey;\n        delete message.__x_id;`
  );

  writeFileSync(utilsPath, content, 'utf8');
  console.log('✅ Successfully patched whatsapp-web.js Utils.js!');
}

// 4. Patch Client.js for "Execution context was destroyed" navigation race
const clientPath = resolve('node_modules', 'whatsapp-web.js', 'src', 'Client.js');
if (existsSync(clientPath)) {
  let clientContent = readFileSync(clientPath, 'utf8');
  if (!clientContent.includes('/* patched-inject */')) {
    const targetEval = `res = await this.pupPage.evaluate(\n                'window.Debug?.VERSION != undefined',\n            );`;
    const safeEval = `/* patched-inject */ try { res = await this.pupPage.evaluate('window.Debug?.VERSION != undefined'); } catch (_) { res = false; }`;
    if (clientContent.includes(targetEval)) {
      clientContent = clientContent.replace(targetEval, safeEval);
      console.log('✅ Patched Client.js for evaluate navigation resilience.');
    }

    const targetInject = `await this.inject();\n\n        this.pupPage.on('framenavigated',`;
    const safeInject = `/* patched-inject-retry */ for (let i = 0; i < 5; i++) {
            try {
                await this.inject();
                break;
            } catch (e) {
                if (i === 4) throw e;
                await new Promise((r) => setTimeout(r, 1500));
            }
        }\n\n        this.pupPage.on('framenavigated',`;
    if (clientContent.includes(targetInject)) {
      clientContent = clientContent.replace(targetInject, safeInject);
      console.log('✅ Patched Client.js for inject retry on navigation.');
    }

    writeFileSync(clientPath, clientContent, 'utf8');
  }
}
