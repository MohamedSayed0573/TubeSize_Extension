import {
    clearLocalCache,
    getFromLocalCache,
    removeFromLocalCache,
    setToLocalCache,
} from "@/lib/cache";

const localGet = jest.fn();
const syncGet = jest.fn();

const localRemove = jest.fn();
const syncRemove = jest.fn();

const localClear = jest.fn();
const syncClear = jest.fn();

const localSet = jest.fn();
const syncSet = jest.fn();

(global as any).chrome = {
    storage: {
        local: {
            set: async (input: Record<string | number, any>) => {
                localSet(input);
            },
            get: async (key: string) => {
                return localGet(key);
            },
            remove: async (key: string) => {
                localRemove(key);
            },
            clear: async () => {
                localClear();
            },
        },
        sync: {
            set: async (input: Record<string | number, any>) => {
                syncSet(input);
            },
            get: async (key: string) => {
                return syncGet(key);
            },
            remove: async (key: string) => {
                syncRemove(key);
            },
            clear: async () => {
                syncClear();
            },
        },
    },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe("getFromCache", () => {
    test("should return undefined for non-existent key", async () => {
        localGet.mockResolvedValueOnce({});
        const result = await getFromLocalCache("nonExistentKey");
        expect(result).toBeUndefined();
    });

    test("should return value for existing key", async () => {
        localGet.mockResolvedValueOnce({ existingKey: "value" });
        const result = await getFromLocalCache("existingKey");
        expect(result).toBe("value");
    });

    test("should return multiple values for array of keys", async () => {
        localGet.mockResolvedValueOnce({ key1: "value1", key2: "value2" });
        const result = await getFromLocalCache(["key1", "key2"]);
        expect(result).toEqual({ key1: "value1", key2: "value2" });
    });

    test("should return all data when key is null", async () => {
        localGet.mockResolvedValueOnce({ key1: "value1", key2: "value2" });
        const result = await getFromLocalCache();
        expect(result).toEqual({ key1: "value1", key2: "value2" });
    });
});

describe("removeFromCache", () => {
    test("should call chrome.storage.local.remove with correct key", async () => {
        await removeFromLocalCache("testKey");
        expect(localRemove).toHaveBeenCalledWith("testKey");
    });
});

describe("clearCache", () => {
    test("should call chrome.storage.local.clear when removing all keys", async () => {
        await clearLocalCache();
        expect(localClear).toHaveBeenCalled();
    });
});

describe("setToCache", () => {
    test("should call chrome.storage.local.set with correct input", async () => {
        const input = { key: "value" };
        await setToLocalCache(input);
        expect(localSet).toHaveBeenCalledWith(input);
    });
});
