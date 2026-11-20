import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 1. Patch Utils.js for media sending memoize fix
const utilsPath = resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');

if (existsSync(utilsPath)) {
  let content = readFileSync(utilsPath, 'utf8');

  if (!content.includes('mediaDataFields')) {
    console.log('🔧 Patching whatsapp-web.js for "Data passed to getter must include an id property" fix...');

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

    content = content.replace(
      '...mediaOptions,',
      '...(window.WWebJS.mediaDataFields ? window.WWebJS.mediaDataFields(mediaOptions) : mediaOptions),'
    );

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
  } else {
    console.log('✅ Utils.js is already patched.');
  }
}

// 2. Patch AuthStore.js for null WAWebSocketModel resilience
const authStorePath = resolve('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'AuthStore', 'AuthStore.js');
if (existsSync(authStorePath)) {
  let authContent = readFileSync(authStorePath, 'utf8');
  let authModified = false;

  if (authContent.includes("window.require('WAWebSocketModel').Socket;")) {
    authContent = authContent.replace(
      "window.require('WAWebSocketModel').Socket;",
      "window.require('WAWebSocketModel')?.Socket;"
    );
    authModified = true;
  }

  if (authContent.includes("window.require(\n        'WAWebOfflineHandler',\n    ).OfflineMessageHandler;")) {
    authContent = authContent.replace(
      "window.require(\n        'WAWebOfflineHandler',\n    ).OfflineMessageHandler;",
      "window.require('WAWebOfflineHandler')?.OfflineMessageHandler;"
    );
    authModified = true;
  }

  if (authModified) {
    writeFileSync(authStorePath, authContent, 'utf8');
    console.log('✅ Successfully patched AuthStore.js for optional chaining on WAWebSocketModel!');
  }
}

// 3. Patch Client.js for evaluate navigation race & WAWebSocketModel Socket null resilience
const clientPath = resolve('node_modules', 'whatsapp-web.js', 'src', 'Client.js');
if (existsSync(clientPath)) {
  let clientContent = readFileSync(clientPath, 'utf8');
  let clientModified = false;

  if (!clientContent.includes('/* patched-inject */')) {
    const targetEval = `res = await this.pupPage.evaluate(\n                'window.Debug?.VERSION != undefined',\n            );`;
    const safeEval = `/* patched-inject */ try { res = await this.pupPage.evaluate('window.Debug?.VERSION != undefined'); } catch (_) { res = false; }`;
    if (clientContent.includes(targetEval)) {
      clientContent = clientContent.replace(targetEval, safeEval);
      clientModified = true;
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
      clientModified = true;
    }
  }

  // Defensively protect needAuthentication against "Cannot read properties of null (reading 'Socket')"
  if (!clientContent.includes('/* patched-socket-null-guard */')) {
    const targetNeedAuth = `const needAuthentication = await this.pupPage.evaluate(async () => {
            let state = window.require('WAWebSocketModel').Socket.state;

            if (
                state === 'OPENING' ||
                state === 'UNLAUNCHED' ||
                state === 'PAIRING'
            ) {
                // wait till state changes
                await new Promise((r) => {
                    window
                        .require('WAWebSocketModel')
                        .Socket.on(
                            'change:state',
                            function waitTillInit(_AppState, state) {
                                if (
                                    state !== 'OPENING' &&
                                    state !== 'UNLAUNCHED' &&
                                    state !== 'PAIRING'
                                ) {
                                    window
                                        .require('WAWebSocketModel')
                                        .Socket.off(
                                            'change:state',
                                            waitTillInit,
                                        );
                                    r();
                                }
                            },
                        );
                });
            }
            state = window.require('WAWebSocketModel').Socket.state;
            return state == 'UNPAIRED' || state == 'UNPAIRED_IDLE';
        });`;

    const safeNeedAuth = `/* patched-socket-null-guard */ const needAuthentication = await this.pupPage.evaluate(async () => {
            const getSocketState = () => {
                try {
                    const mod = window.require ? window.require('WAWebSocketModel') : null;
                    return mod?.Socket?.state;
                } catch (_) {
                    return null;
                }
            };
            let state = getSocketState();

            if (
                state === 'OPENING' ||
                state === 'UNLAUNCHED' ||
                state === 'PAIRING'
            ) {
                await new Promise((r) => {
                    try {
                        const mod = window.require ? window.require('WAWebSocketModel') : null;
                        if (!mod?.Socket) return r();
                        mod.Socket.on(
                            'change:state',
                            function waitTillInit(_AppState, s) {
                                if (
                                    s !== 'OPENING' &&
                                    s !== 'UNLAUNCHED' &&
                                    s !== 'PAIRING'
                                ) {
                                    try { mod.Socket.off('change:state', waitTillInit); } catch (_) {}
                                    r();
                                }
                            },
                        );
                    } catch (_) {
                        r();
                    }
                });
            }
            state = getSocketState();
            return !state || state == 'UNPAIRED' || state == 'UNPAIRED_IDLE';
        });`;

    if (clientContent.includes(targetNeedAuth)) {
      clientContent = clientContent.replace(targetNeedAuth, safeNeedAuth);
      clientModified = true;
      console.log('✅ Patched Client.js for needAuthentication socket null safety.');
    }

    // Also guard appState change listener attachment (around line 398)
    const targetAppState = `        await this.pupPage.evaluate(() => {
            window
                .require('WAWebSocketModel')
                .Socket.on('change:state', (_AppState, state) => {
                    window.onAuthAppStateChangedEvent(state);
                });
            window
                .require('WAWebSocketModel')
                .Socket.on('change:hasSynced', () => {
                    window.onAppStateHasSyncedEvent();
                });
            const Cmd = window.require('WAWebCmd').Cmd;`;

    const safeAppState = `        await this.pupPage.evaluate(() => {
            try {
                const wsMod = window.require ? window.require('WAWebSocketModel') : null;
                if (wsMod?.Socket) {
                    wsMod.Socket.on('change:state', (_AppState, state) => {
                        window.onAuthAppStateChangedEvent(state);
                    });
                    wsMod.Socket.on('change:hasSynced', () => {
                        window.onAppStateHasSyncedEvent();
                    });
                }
            } catch (_) {}
            const Cmd = (window.require ? window.require('WAWebCmd') : null)?.Cmd;`;

    if (clientContent.includes(targetAppState)) {
      clientContent = clientContent.replace(targetAppState, safeAppState);
      clientModified = true;
      console.log('✅ Patched Client.js for appState listener socket null safety.');
    }
  }

  if (clientModified) {
    writeFileSync(clientPath, clientContent, 'utf8');
    console.log('✅ Successfully patched Client.js!');
  }
}
