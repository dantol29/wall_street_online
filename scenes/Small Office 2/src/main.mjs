import * as pc from 'playcanvas';
import config from './data/config.json';

window.pc = pc;

const sceneUrls = import.meta.glob('./data/scenes/**/*.json', { eager: true, query: '?url', import: 'default' });
const createConfigUrl = (data, urls) => {
    const next = JSON.parse(JSON.stringify(data));
    if (Array.isArray(next.scenes)) {
        next.scenes.forEach((scene) => {
            if (scene.url) {
                scene.url = getSceneUrl(scene.url);
            }
        });
    }
    return URL.createObjectURL(new Blob([JSON.stringify(next)], { type: 'application/json' }));
};

export const getSceneUrl = url => sceneUrls[`./data/${url}`] || url;
export const configUrl = createConfigUrl(config);

const bootstrap = import.meta.glob('./bootstrap/*.js', { eager: true, query: '?url', import: 'default' });
const scripts = import.meta.glob('./scripts/**/*.js', { eager: true, query: '?url', import: 'default' });
const loadScriptAsset = pc.ScriptHandler.prototype._loadScript;
const getScriptUrl = (url) => {
    const marker = '/scripts/';
    const pathname = new URL(url, window.location.href).pathname;
    const index = pathname.indexOf(marker);

    if (index === -1) {
        return null;
    }

    return scripts[`./scripts/${decodeURIComponent(pathname.slice(index + marker.length))}`];
};

pc.ScriptHandler.prototype._loadScript = function (url, callback) {
    loadScriptAsset.call(this, getScriptUrl(url) || url, callback);
};

const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(script);
    });
};

const main = async () => {
    await loadScript(bootstrap['./bootstrap/settings.js']);
    window.CONFIG_FILENAME = configUrl;
    window.SCENE_PATH = getSceneUrl(window.SCENE_PATH);
    await loadScript(bootstrap['./bootstrap/modules.js']);
    await loadScript(bootstrap['./bootstrap/start.js']);
    await loadScript(bootstrap['./bootstrap/loading.js']);
};

main().catch((err) => {
    console.error(err);
});
