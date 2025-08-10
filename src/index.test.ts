import { test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { writeFile, mkdir, rm } from "fs/promises";

let ConfigExplorer: any;

// Helper: create a temp directory with config files
async function setupTestDir() {
  const tmpDir = join(process.cwd(), "tests", "tmp-configrep");
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(tmpDir, { recursive: true });
  // .env
  await writeFile(join(tmpDir, ".env"), "FOO=bar\nBAR=baz");
  // config.json
  await writeFile(join(tmpDir, "config.json"), JSON.stringify({ a: 1, b: { c: 2 } }));
  // config.yaml
  await writeFile(join(tmpDir, "config.yaml"), "foo: bar\nbaz: qux");
  // config.toml
  await writeFile(join(tmpDir, "config.toml"), "foo = 'bar'\nbaz = 42");
  // config.ini
  await writeFile(join(tmpDir, "config.ini"), "[section]\nkey=value");
  // Malformed file
  await writeFile(join(tmpDir, "broken.json"), "{ not: valid json }");
  return tmpDir;
}

beforeAll(async () => {
  const mod = await import("../src/index.ts");
  ConfigExplorer = mod.ConfigExplorer;
});

test("ConfigExplorer finds all config files", async () => {
  const tmpDir = await setupTestDir();
  const explorer = new ConfigExplorer();
  explorer.setRootDirectory(tmpDir);
  const files = await explorer.findConfigFiles(tmpDir, 2, []);
  const names = files.map((f: any) => f.name).sort();
  expect(names).toEqual([
    ".env",
    "broken.json",
    "config.ini",
    "config.json",
    "config.toml",
    "config.yaml"
  ]);
});

test("ConfigExplorer parses .env files", async () => {
  const tmpDir = await setupTestDir();
  const explorer = new ConfigExplorer();
  explorer.setRootDirectory(tmpDir);
  const files = await explorer.findConfigFiles(tmpDir, 2, []);
  const envFile = files.find((f: any) => f.name === ".env");
  expect(envFile).toBeTruthy();
  const parsed = await explorer.parseConfigFile(envFile);
  expect(parsed.entries).toEqual([
    { key: "FOO", value: "bar", file: envFile.path },
    { key: "BAR", value: "baz", file: envFile.path }
  ]);
});

test("ConfigExplorer parses JSON, YAML, TOML, INI", async () => {
  const tmpDir = await setupTestDir();
  const explorer = new ConfigExplorer();
  explorer.setRootDirectory(tmpDir);
  const files = await explorer.findConfigFiles(tmpDir, 2, []);
  // JSON
  const jsonFile = files.find((f: any) => f.name === "config.json");
  const jsonParsed = await explorer.parseConfigFile(jsonFile);
  expect(jsonParsed.entries).toContainEqual({ key: "a", value: "1", file: jsonFile.path });
  expect(jsonParsed.entries).toContainEqual({ key: "b.c", value: "2", file: jsonFile.path });
  // YAML
  const yamlFile = files.find((f: any) => f.name === "config.yaml");
  const yamlParsed = await explorer.parseConfigFile(yamlFile);
  expect(yamlParsed.entries).toContainEqual({ key: "foo", value: "bar", file: yamlFile.path });
  expect(yamlParsed.entries).toContainEqual({ key: "baz", value: "qux", file: yamlFile.path });
  // TOML
  const tomlFile = files.find((f: any) => f.name === "config.toml");
  const tomlParsed = await explorer.parseConfigFile(tomlFile);
  expect(tomlParsed.entries).toContainEqual({ key: "foo", value: "bar", file: tomlFile.path });
  expect(tomlParsed.entries).toContainEqual({ key: "baz", value: "42", file: tomlFile.path });
  // INI
  const iniFile = files.find((f: any) => f.name === "config.ini");
  const iniParsed = await explorer.parseConfigFile(iniFile);
  expect(iniParsed.entries).toContainEqual({ key: "section.key", value: "value", file: iniFile.path });
});

test("ConfigExplorer handles malformed files gracefully", async () => {
  const tmpDir = await setupTestDir();
  const explorer = new ConfigExplorer();
  explorer.setRootDirectory(tmpDir);
  const files = await explorer.findConfigFiles(tmpDir, 2, []);
  const broken = files.find((f: any) => f.name === "broken.json");
  const parsed = await explorer.parseConfigFile(broken);
  expect(parsed.entries).toEqual([]);
  expect(parsed.error).toBeDefined();
});

afterAll(async () => {
  const tmpDir = join(process.cwd(), "tests", "tmp-configrep");
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});
