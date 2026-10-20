// extension.mjs - Software Factory canvas (project scope). Wiring only.
//
//   state.mjs     pure parsing and the stage model (unit-tested)
//   github.mjs    all GitHub I/O through the signed-in gh CLI
//   server.mjs    per-instance loopback server, live updates, actions, agent prompts
//   renderer.mjs  the canvas page
//
// The factory (this repository) holds the catalog and the template. The workflows run in the target repository;
// this canvas deploys the template there and monitors the runs, like one dashboard over many pipelines.

import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeInstance, createInstanceServer, pushState } from "./server.mjs";

const FACTORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const instances = new Map();
let sessionRef = null;

function logFn(message, opts) {
    try {
        return sessionRef && sessionRef.log(message, opts);
    } catch {
        /* best effort */
    }
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "software-factory",
            displayName: "Software Factory",
            description:
                "Deploy the factory's Java modernization template to a nominated catalog repository and drive its assess, plan, execute, validate lifecycle with three human gates. Live progress and cost from GitHub.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    repo: { type: "string", description: "owner/name of a repository in templates/catalog.json. Defaults to the first nominated one." },
                    issue: { type: "integer", description: "Modernization Request issue number to open. Defaults to the newest open request." },
                },
            },
            actions: [
                {
                    name: "get_state",
                    description: "Return the current state: selected repository, template status, request, the seven stages with progress, gate status, links and cost cards.",
                    handler: async (ctx) => {
                        const rec = instances.get(ctx.instanceId);
                        if (!rec) throw new CanvasError("not_open", "Software Factory is not open.");
                        return rec.lastState || (await pushState(rec, logFn));
                    },
                },
                {
                    name: "refresh",
                    description: "Read GitHub again and push fresh state to the canvas.",
                    handler: async (ctx) => {
                        const rec = instances.get(ctx.instanceId);
                        if (!rec) throw new CanvasError("not_open", "Software Factory is not open.");
                        rec.forceRepo = true;
                        const state = await pushState(rec, logFn);
                        return { ok: !!(state && state.ok), updatedAt: state && state.updatedAt };
                    },
                },
                {
                    name: "open_request",
                    description: "Show a specific Modernization Request issue in the canvas.",
                    inputSchema: { type: "object", properties: { issue: { type: "integer" } }, required: ["issue"] },
                    handler: async (ctx) => {
                        const rec = instances.get(ctx.instanceId);
                        if (!rec) throw new CanvasError("not_open", "Software Factory is not open.");
                        rec.issue = Number(ctx.input && ctx.input.issue) || null;
                        await pushState(rec, logFn);
                        return { ok: true, issue: rec.issue };
                    },
                },
            ],
            open: async (ctx) => {
                const input = ctx.input || {};
                let rec = instances.get(ctx.instanceId);
                if (!rec) {
                    rec = await createInstanceServer({
                        factoryRoot: FACTORY_ROOT,
                        repo: input.repo,
                        issue: input.issue,
                        sendPrompt: (prompt) => sessionRef.send({ prompt }),
                        log: logFn,
                    });
                    instances.set(ctx.instanceId, rec);
                } else {
                    if (input.repo) rec.repo = input.repo;
                    if (input.issue) rec.issue = input.issue;
                }
                pushState(rec, logFn);
                return { title: "Software Factory", status: rec.repo || "catalog", url: rec.url };
            },
            onClose: async (ctx) => {
                const rec = instances.get(ctx.instanceId);
                if (rec) {
                    instances.delete(ctx.instanceId);
                    await closeInstance(rec);
                }
            },
        }),
    ],
});

sessionRef = session;

// A finished agent turn (for example Deploy) may have changed the target; refresh every open canvas.
session.on("session.idle", async () => {
    for (const rec of instances.values()) {
        rec.forceRepo = true;
        await pushState(rec, logFn);
    }
});

await session.log("Software Factory canvas ready", { ephemeral: true });
