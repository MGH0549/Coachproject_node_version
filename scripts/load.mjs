// Run against staging with an ACTIVE client token; no personal data is printed.
const base = process.env.LOAD_BASE_URL ?? 'http://localhost:3000/api/v1';
const token = process.env.LOAD_ACCESS_TOKEN;
if (!token) throw new Error('LOAD_ACCESS_TOKEN is required');
const samples = [];
let failures = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    for (let i = 0; i < 10; i++) {
      for (const path of ['/me/training', '/me/progress']) {
        const start = performance.now();
        const response = await fetch(`${base}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        await response.arrayBuffer();
        samples.push(performance.now() - start);
        if (!response.ok) failures++;
      }
    }
  }),
);
samples.sort((a, b) => a - b);
const p95 = samples[Math.floor(samples.length * 0.95)];
console.log(
  JSON.stringify({
    requests: samples.length,
    failures,
    p95ms: Math.round(p95),
    targetMs: 200,
  }),
);
if (failures || p95 >= 200) process.exitCode = 1;
