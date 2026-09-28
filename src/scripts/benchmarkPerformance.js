import "dotenv/config";
import { initializeDatabaseConnections } from "../config/database.js";
import { CategoryRepository } from "../infrastructure/databases/postgres/categoryRepository.js";
import { SubcategoryRepository } from "../infrastructure/databases/postgres/subcategoryRepository.js";
import { MeditationRepository } from "../infrastructure/databases/postgres/meditationRepository.js";
import { DashboardRepository } from "../infrastructure/databases/postgres/dashboardRepository.js";
import { TagRepository } from "../infrastructure/databases/postgres/tagRepository.js";
import { CacheService } from "../infrastructure/services/cacheService.js";

async function runBenchmark() {
  console.log("🚀 Starting API & Repository Performance Benchmark...\n");

  const { prisma } = await initializeDatabaseConnections();

  const categoryRepo = new CategoryRepository(prisma);
  const subcategoryRepo = new SubcategoryRepository(prisma);
  const meditationRepo = new MeditationRepository(prisma);
  const dashboardRepo = new DashboardRepository(prisma);
  const tagRepo = new TagRepository(prisma);

  // Clear existing caches to measure initial DB cold hit vs warm cache hit
  await CacheService.clearPattern("*");

  const benchmarks = [];

  async function measure(name, fn) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    return duration;
  }

  // 1. Dashboard Stats Benchmark
  const dashCold = await measure("Dashboard Stats (Cold DB)", () => dashboardRepo.getStats());
  const dashWarm = await measure("Dashboard Stats (Warm Cache)", () => dashboardRepo.getStats());
  benchmarks.push({
    Endpoint: "Dashboard Stats",
    "Cold DB Latency": `${dashCold.toFixed(2)} ms`,
    "Warm Cache Latency": `${dashWarm.toFixed(2)} ms`,
    Speedup: `${(dashCold / Math.max(dashWarm, 0.01)).toFixed(1)}x faster ⚡`,
  });

  // 2. Category Listing Benchmark
  const catCold = await measure("Category List (Cold DB)", () => categoryRepo.findAll());
  const catWarm = await measure("Category List (Warm Cache)", () => categoryRepo.findAll());
  benchmarks.push({
    Endpoint: "Category List",
    "Cold DB Latency": `${catCold.toFixed(2)} ms`,
    "Warm Cache Latency": `${catWarm.toFixed(2)} ms`,
    Speedup: `${(catCold / Math.max(catWarm, 0.01)).toFixed(1)}x faster ⚡`,
  });

  // 3. Subcategory Listing Benchmark
  const subCold = await measure("Subcategory List (Cold DB)", () => subcategoryRepo.findAll());
  const subWarm = await measure("Subcategory List (Warm Cache)", () => subcategoryRepo.findAll());
  benchmarks.push({
    Endpoint: "Subcategory List",
    "Cold DB Latency": `${subCold.toFixed(2)} ms`,
    "Warm Cache Latency": `${subWarm.toFixed(2)} ms`,
    Speedup: `${(subCold / Math.max(subWarm, 0.01)).toFixed(1)}x faster ⚡`,
  });

  // 4. Meditation Catalog Benchmark
  const medCold = await measure("Meditation Catalog (Cold DB)", () => meditationRepo.findAll(10, 1));
  const medWarm = await measure("Meditation Catalog (Warm Cache)", () => meditationRepo.findAll(10, 1));
  benchmarks.push({
    Endpoint: "Meditation Catalog",
    "Cold DB Latency": `${medCold.toFixed(2)} ms`,
    "Warm Cache Latency": `${medWarm.toFixed(2)} ms`,
    Speedup: `${(medCold / Math.max(medWarm, 0.01)).toFixed(1)}x faster ⚡`,
  });

  // 5. Tag Listing Benchmark
  const tagCold = await measure("Tag List (Cold DB)", () => tagRepo.findAll());
  const tagWarm = await measure("Tag List (Warm Cache)", () => tagRepo.findAll());
  benchmarks.push({
    Endpoint: "Tag List",
    "Cold DB Latency": `${tagCold.toFixed(2)} ms`,
    "Warm Cache Latency": `${tagWarm.toFixed(2)} ms`,
    Speedup: `${(tagCold / Math.max(tagWarm, 0.01)).toFixed(1)}x faster ⚡`,
  });

  console.table(benchmarks);
  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
