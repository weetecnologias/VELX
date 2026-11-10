/** Vite replaces these values; the local test UI is removed from production builds. */
export const localTestMode = import.meta.env.DEV && import.meta.env.VELX_LOCAL_TEST_AUTH === true;
