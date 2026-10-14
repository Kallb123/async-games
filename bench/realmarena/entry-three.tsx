// The bench page drawing the 3D board, the experiment (BenchApp.tsx, docs/realm-arena-3d.md).
import RealmArenaBoard3D from "@/games/RealmArena/components/RealmArenaBoard3D";
import { renderStats } from "@/games/RealmArena/three/board3d";
import { startBench } from "./BenchApp";

startBench(RealmArenaBoard3D, renderStats);
