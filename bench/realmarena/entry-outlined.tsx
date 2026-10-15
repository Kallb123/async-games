// The bench page drawing the 3D board with a dark outline round every figure (BenchApp.tsx), to measure what the outline costs beside the plain 3D board (entry-three.tsx).
import { RealmArenaBoard3DOutlined } from "@/games/RealmArena/components/RealmArenaBoard3D";
import { renderStats } from "@/games/RealmArena/three/board3d";
import { startBench } from "./BenchApp";

startBench(RealmArenaBoard3DOutlined, renderStats);
