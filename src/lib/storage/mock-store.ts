type MockStoredObject = Readonly<{
  buffer: ArrayBuffer;
  contentType: string;
}>;

// Route와 provider가 별도 bundle이어도 같은 서버 프로세스의 ephemeral store를 공유한다.
// 서버 재시작 시 globalThis와 함께 사라지며 durable state로 사용되지 않는다.
type MockStorageGlobal = typeof globalThis & {
  __miraMockStorageUploadStore?: Map<string, MockStoredObject>;
};

function mockStorageGlobal(value: typeof globalThis): MockStorageGlobal {
  return value;
}

function uploadStore(): Map<string, MockStoredObject> {
  const processGlobal = mockStorageGlobal(globalThis);
  processGlobal.__miraMockStorageUploadStore ??= new Map();
  return processGlobal.__miraMockStorageUploadStore;
}

export function recordMockStorageObject(
  key: string,
  buffer: ArrayBuffer,
  contentType: string,
): void {
  uploadStore().set(key, { buffer, contentType });
}

export function readMockStorageObject(key: string): MockStoredObject | undefined {
  return uploadStore().get(key);
}

export function hasMockStorageObject(key: string): boolean {
  return uploadStore().has(key);
}

export function deleteMockStorageObject(key: string): void {
  uploadStore().delete(key);
}

export function clearMockStorageStoreForTests(): void {
  uploadStore().clear();
}
