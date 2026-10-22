import mongoose, { Schema } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_AUTO_BUILD, RUNTIME_CONNECT_OPTIONS } from "./connectionOptions";
import { dbConnect } from "./mongodb";

// A new serverless instance must not spend its first seconds creating
// collections and indexes (connectionOptions.ts). No database is needed to
// check it: one test pins what the app hands `mongoose.connect`, the other
// pins that Mongoose, in the version installed, honours those options for a
// model compiled before the connection opened.

// Mongoose's internal wait for a connection to open, which its typings don't show.
const waitForConnect = (connection: object) => vi.spyOn(connection as { _waitForConnect(): Promise<void> }, "_waitForConnect");

describe("the runtime connection", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.MONGODB_URI;
    });

    it("is opened with autoIndex and autoCreate off", async () => {
        process.env.MONGODB_URI = "mongodb://example.invalid/test";
        const client = { on: vi.fn() };
        const connect = vi.spyOn(mongoose, "connect").mockResolvedValue({ connection: { getClient: () => client } } as never);

        await dbConnect();

        expect(connect).toHaveBeenCalledTimes(1);
        expect(connect.mock.calls[0][0]).toBe("mongodb://example.invalid/test");
        expect(connect.mock.calls[0][1]).toMatchObject({ autoIndex: false, autoCreate: false, bufferCommands: false });
    });

    it("spells the two off in the options themselves", () => {
        expect(NO_AUTO_BUILD).toEqual({ autoIndex: false, autoCreate: false });
        expect(RUNTIME_CONNECT_OPTIONS).toMatchObject(NO_AUTO_BUILD);
    });
});

describe("Mongoose's model init", () => {
    it("builds nothing when the connection options say so, though the model was compiled first", async () => {
        const connection = mongoose.createConnection();
        // The wait for the connection to open, which `Model.init()` sits in
        // until `connect` has run, stood in for by an immediate return.
        let opened!: () => void;
        const open = new Promise<void>(resolve => (opened = resolve));
        waitForConnect(connection).mockReturnValue(open);

        const schema = new Schema({ key: { type: String, index: true } });
        const Probe = connection.model("InitProbe", schema);
        const createCollection = vi.spyOn(Probe, "createCollection").mockResolvedValue(undefined as never);
        const ensureIndexes = vi.spyOn(Probe, "ensureIndexes").mockResolvedValue(undefined as never);

        // What `openUri` does with `autoIndex` / `autoCreate`, once `connect` runs.
        Object.assign(connection.config, NO_AUTO_BUILD);
        opened();
        await Probe.init();

        expect(createCollection).not.toHaveBeenCalled();
        expect(ensureIndexes).not.toHaveBeenCalled();
    });

    it("does build both by default, so the test above can tell the difference", async () => {
        const connection = mongoose.createConnection();
        waitForConnect(connection).mockResolvedValue(undefined);

        const Probe = connection.model("InitProbeDefault", new Schema({ key: { type: String, index: true } }));
        const createCollection = vi.spyOn(Probe, "createCollection").mockResolvedValue(undefined as never);
        const ensureIndexes = vi.spyOn(Probe, "ensureIndexes").mockResolvedValue(undefined as never);

        await Probe.init();

        expect(createCollection).toHaveBeenCalled();
        expect(ensureIndexes).toHaveBeenCalled();
    });
});
