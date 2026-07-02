"use client";

import { useRef, useMemo, useLayoutEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import type { Group, InstancedMesh, Mesh } from "three";
import * as THREE from "three";

const SPINE_COUNT = 48;
const AMBER = "#f59e0b";
const GOLD = "#fbbf24";
const WARM = "#d97706";

function AlbumSpineRow({ side }: { side: -1 | 1 }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const spines = useMemo(() => {
    return Array.from({ length: SPINE_COUNT }, (_, i) => ({
      z: -1.5 - (i / SPINE_COUNT) * 14,
      height: 0.55 + Math.random() * 0.45,
      width: 0.1 + Math.random() * 0.06,
      hue: 0.08 + Math.random() * 0.04,
    }));
  }, []);

  useLayoutEffect(() => {
    if (!ref.current) return;

    spines.forEach((spine, i) => {
      dummy.position.set(side * (1.8 + Math.random() * 0.3), spine.height / 2 - 0.3, spine.z);
      dummy.scale.set(spine.width, spine.height, 0.025);
      dummy.rotation.y = side * 0.08;
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);

      const color = new THREE.Color().setHSL(spine.hue, 0.35, 0.12 + Math.random() * 0.08);
      ref.current!.setColorAt(i, color);
    });

    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [dummy, spines, side]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, SPINE_COUNT]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        metalness={0.2}
        roughness={0.85}
        emissive={AMBER}
        emissiveIntensity={0.03}
      />
    </instancedMesh>
  );
}

function PendantLamp({
  position,
  phase = 0,
}: {
  position: [number, number, number];
  phase?: number;
}) {
  const bulbRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(t * 0.6) * 0.04;
    }
    if (bulbRef.current) {
      const pulse = 0.85 + Math.sin(t * 2.2) * 0.15;
      (bulbRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.8 * pulse;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 2.4, 8]} />
        <meshStandardMaterial color="#292524" metalness={0.6} roughness={0.4} />
      </mesh>
      <Float speed={0.8} floatIntensity={0.15} rotationIntensity={0.05}>
        <mesh ref={bulbRef} position={[0, 0, 0]}>
          <sphereGeometry args={[0.09, 20, 20]} />
          <meshStandardMaterial
            color={GOLD}
            emissive={GOLD}
            emissiveIntensity={1.8}
            toneMapped={false}
          />
        </mesh>
      </Float>
      <pointLight color={AMBER} intensity={2.2} distance={9} decay={2} />
    </group>
  );
}

function ShopFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, -6]}>
      <planeGeometry args={[14, 22, 1, 1]} />
      <meshStandardMaterial
        color="#0c0a09"
        metalness={0.4}
        roughness={0.65}
        emissive={WARM}
        emissiveIntensity={0.02}
      />
    </mesh>
  );
}

function GrooveRings() {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.z = clock.elapsedTime * 0.03;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.34, -6]} rotation={[-Math.PI / 2, 0, 0]}>
      {[2, 3.5, 5, 6.5, 8].map((radius, i) => (
        <mesh key={radius}>
          <ringGeometry args={[radius - 0.02, radius, 64]} />
          <meshBasicMaterial
            color={AMBER}
            transparent
            opacity={0.04 + i * 0.008}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function CameraDrift() {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.12) * 0.25;
    camera.position.y = 0.35 + Math.sin(t * 0.18) * 0.08;
    camera.lookAt(0, 0.1, -6);
  });
  return null;
}

function SceneContent() {
  return (
    <>
      <CameraDrift />
      <ambientLight intensity={0.08} color="#1c1917" />
      <PendantLamp position={[-1.2, 2.8, -2]} phase={0} />
      <PendantLamp position={[1.4, 2.6, -4]} phase={1.2} />
      <PendantLamp position={[-0.6, 2.9, -7]} phase={2.4} />
      <PendantLamp position={[0.8, 2.5, -10]} phase={3.6} />
      <spotLight
        position={[0, 6, 2]}
        angle={0.55}
        penumbra={1}
        color={GOLD}
        intensity={0.4}
        distance={20}
      />
      <ShopFloor />
      <GrooveRings />
      <AlbumSpineRow side={-1} />
      <AlbumSpineRow side={1} />
      <Sparkles
        count={120}
        size={1.2}
        scale={[10, 6, 16]}
        position={[0, 1, -5]}
        color={GOLD}
        opacity={0.35}
        speed={0.15}
      />
      <fog attach="fog" args={["#0c0a09", 3, 16]} />
    </>
  );
}

export function NoirScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.35, 3.5], fov: 52, near: 0.1, far: 30 }}
      dpr={[1, 1.5]}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      style={{ background: "transparent" }}
    >
      <SceneContent />
    </Canvas>
  );
}
