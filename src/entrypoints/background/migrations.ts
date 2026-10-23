import { storage } from "@wxt-dev/storage";

type Migration = {
    name: string;
    last_version: string;
    run: () => Promise<void>;
};

const migrations: Migration[] = [
    {
        name: "remove-legacy-quality-ids",
        last_version: "3.0.2",
        run: () => storage.removeItem("sync:qualityIds"),
    },
];

export async function runMigrations(): Promise<void> {
    for (const migration of migrations) {
        try {
            await migration.run();
        } catch (err) {
            console.error(`Migration "${migration.name}" failed`, err);
        }
    }
}
