import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const utilsPath = resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');

if (!existsSync(utilsPath)) {
  console.log('ℹ whatsapp-web.js not found in node_modules, skipping patch.');
  process.exit(0);
}

let content = readFileSync(utilsPath, 'utf8');

if (content.includes('mediaDataFields')) {
  console.log('✅ whatsapp-web.js is already patched for media sending memoize fix.');
  process.exit(0);
}

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
console.log('✅ Successfully patched whatsapp-web.js for media sending!');
