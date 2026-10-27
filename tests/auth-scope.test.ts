import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileStore } from "@/lib/store/file-store";
import type { Investigation, Project } from "@/lib/store/types";

const session = { current: null as null | { user: { id: string } } };
const flags = { enabled: true };
vi.mock("@/auth", () => ({
  get authEnabled() {
    return flags.enabled;
  },
  auth: async () => session.current,
}));

const user = await import("@/lib/server/user");

afterEach(() => {
  session.current = null;
  flags.enabled = true;
});

describe("per-user access rules", () => {
  it("is fully open when sign-in is not configured", async () => {
    flags.enabled = false;
    expect(await user.requireUser()).toBeNull();
    expect(user.ownerFilter(null)).toBeUndefined();
    expect(user.canViewProject({ ownerId: "github:1" }, null)).toBe(true);
    expect(user.canViewInvestigation({ ownerId: "github:1" }, null)).toBe(true);
  });

  it("rejects anonymous writes with a 401 when sign-in is on", async () => {
    await expect(user.requireUser()).rejects.toMatchObject({ status: 401 });
    session.current = { user: { id: "github:1" } };
    expect(await user.requireUser()).toBe("github:1");
  });

  it("keeps projects and investigations private to their owner", () => {
    expect(user.canViewProject({ ownerId: "github:1" }, "github:1")).toBe(true);
    expect(user.canViewProject({ ownerId: "github:1" }, "github:2")).toBe(false);
    expect(user.canViewProject({ ownerId: null }, "github:2")).toBe(true); // the shared sample
    expect(user.canViewInvestigation({ ownerId: "github:1" }, "github:2")).toBe(false);
    expect(user.canViewInvestigation({ ownerId: null }, "github:2")).toBe(false);
    // An anonymous caller never matches an owner, even an empty one.
    expect(user.ownerFilter(null)).toBe("");
  });
});

describe("FileStore owner filters", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("lists only the requested owner's records", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "aftermath-owner-"));
    const store = new FileStore(dir);
    const stats = { files: 0, edges: 0, externalPackages: 0, unresolved: 0, skippedFiles: 0 } as Project["stats"];
    const proj = (id: string, ownerId: string | null): Project => ({ id, name: id, source: { type: "zip", label: "x" }, createdAt: new Date().toISOString(), stats, ownerId, graph: {} as Project["graph"], files: {} });
    await store.saveProject(proj("p-alice00001", "github:1"));
    await store.saveProject(proj("p-bobbb00001", "github:2"));
    expect((await store.listProjects("github:1")).map((p) => p.id)).toEqual(["p-alice00001"]);
    expect(await store.listProjects("")).toEqual([]);
    expect(await store.listProjects()).toHaveLength(2);

    const inv = (id: string, ownerId: string): Investigation =>
      ({ id, projectId: "p-alice00001", title: "t", target: { file: "a.ts", symbol: null }, change: "c", mode: "symbol", createdAt: new Date().toISOString(), stats: {}, ownerId, report: {}, explanation: {} }) as unknown as Investigation;
    await store.saveInvestigation(inv("inv-alice0001", "github:1"));
    await store.saveInvestigation(inv("inv-bobbb0001", "github:2"));
    expect((await store.listInvestigations("p-alice00001", "github:2")).map((i) => i.id)).toEqual(["inv-bobbb0001"]);
    expect(await store.listInvestigations("p-alice00001")).toHaveLength(2);
  });
});
