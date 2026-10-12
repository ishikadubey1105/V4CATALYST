import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Html, RoundedBox, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

/*
 * The login hero: a thread being drawn along a relay arc between two stations (one person hands a case over, the
 * other receives it) — the case keeps its thread — with the case's documents floating behind. Everything is built from primitives — no model or
 * texture downloads. Palette: olive, white, caramel brown.
 */

const CARAMEL = '#c08040'
const OLIVE_LIGHT = '#b6c17f'
const PAPER = '#fbfaf7'
const MOSS = '#4a8a47'

const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2.7, -1.15, 0.2),
  new THREE.Vector3(-1.4, 0.35, -0.2),
  new THREE.Vector3(0, 0.95, -0.5),
  new THREE.Vector3(1.4, 0.35, -0.2),
  new THREE.Vector3(2.7, -1.15, 0.2),
])

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const THREAD_SEGMENTS = 200
const THREAD_RADIAL = 10

/**
 * The thread: a glowing bead travels from the person handing over to the person receiving, laying an unbroken
 * caramel thread behind it. The thread is one prebuilt tube revealed with drawRange (no per-frame geometry).
 */
function ThreadRunner({ animate }: { animate: boolean }) {
  const bead = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const tube = useMemo(() => new THREE.TubeGeometry(curve, THREAD_SEGMENTS, 0.03, THREAD_RADIAL, false), [])
  useFrame(({ clock }) => {
    // 3.2s to draw the thread end to end, 1.3s holding the finished thread, then again
    const cycle = animate ? clock.elapsedTime % 4.5 : 3.2
    const t = ease(Math.min(cycle / 3.2, 1))
    tube.setDrawRange(0, Math.floor(t * THREAD_SEGMENTS) * THREAD_RADIAL * 6)
    const p = curve.getPointAt(Math.max(t, 0.001))
    bead.current?.position.copy(p)
    light.current?.position.copy(p)
    if (bead.current) bead.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 6) * 0.08)
  })
  return (
    <>
      <pointLight ref={light} color={CARAMEL} intensity={7} distance={3.4} decay={2} />
      <mesh geometry={tube}>
        <meshStandardMaterial color={CARAMEL} emissive={CARAMEL} emissiveIntensity={0.55} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh ref={bead}>
        <sphereGeometry args={[0.11, 32, 32]} />
        <meshStandardMaterial color="#f3dcb8" emissive={CARAMEL} emissiveIntensity={1.4} roughness={0.2} />
      </mesh>
    </>
  )
}

function Track() {
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.012, 8, false), [])
  const dots = useMemo(() => Array.from({ length: 34 }, (_, i) => curve.getPointAt(i / 33)), [])
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color={OLIVE_LIGHT} transparent opacity={0.55} />
      </mesh>
      {dots.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.022, 10, 10]} />
          <meshBasicMaterial color={OLIVE_LIGHT} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Station({ x, initials, name, role, ring }: { x: number; initials: string; name: string; role: string; ring: string }) {
  const glow = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (glow.current) glow.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2 + x) * 0.06)
  })
  return (
    <group position={[x, -1.55, 0.2]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[0.55, 0.62, 0.22, 48]} />
        <meshStandardMaterial color="#4e5926" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh ref={glow} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.02, 12, 64]} />
        <meshBasicMaterial color={ring} />
      </mesh>
      <Html position={[0, 0.62, 0]} center distanceFactor={7} zIndexRange={[20, 0]}>
        <div className="pointer-events-none flex select-none items-center gap-2 whitespace-nowrap rounded-full bg-white/95 py-1 pl-1 pr-3 shadow-lg">
          <span className="grid size-7 place-items-center rounded-full bg-[#ecd8bd] text-[11px] font-semibold text-[#5a3a1c]">{initials}</span>
          <span className="leading-tight">
            <span className="block text-[12px] font-semibold text-[#2b231c]">{name}</span>
            <span className="block text-[10px] text-[#8c7d6a]">{role}</span>
          </span>
        </div>
      </Html>
    </group>
  )
}

const docs = [
  { pos: [-2.3, 1.25, -1.6], rot: [0.12, 0.45, -0.08] },
  { pos: [-0.85, 1.75, -2.4], rot: [0.05, 0.2, 0.06] },
  { pos: [0.75, 1.7, -2.2], rot: [0.08, -0.25, -0.05] },
  { pos: [2.25, 1.15, -1.5], rot: [0.1, -0.45, 0.08] },
  { pos: [0, -0.05, -3], rot: [0.02, 0, 0] },
] as const

function Document({ pos, rot, i }: { pos: readonly number[]; rot: readonly number[]; i: number }) {
  return (
    <Float speed={1.4 + i * 0.15} rotationIntensity={0.35} floatIntensity={0.7}>
      <group position={pos as unknown as THREE.Vector3Tuple} rotation={rot as unknown as THREE.Vector3Tuple}>
        <RoundedBox args={[0.82, 1.06, 0.035]} radius={0.05} smoothness={4}>
          <meshStandardMaterial color={PAPER} roughness={0.7} emissive={PAPER} emissiveIntensity={0.18} />
        </RoundedBox>
        {[0.3, 0.17, 0.04, -0.09].map((y, j) => (
          <mesh key={y} position={[-0.08 + (j === 0 ? 0.04 : 0), y, 0.02]}>
            <boxGeometry args={[j === 0 ? 0.42 : 0.5 - j * 0.06, j === 0 ? 0.055 : 0.032, 0.005]} />
            <meshBasicMaterial color={j === 0 ? '#57493b' : '#dbd1c3'} />
          </mesh>
        ))}
        <mesh position={[0.24, -0.33, 0.025]}>
          <circleGeometry args={[0.1, 32]} />
          <meshBasicMaterial color={MOSS} />
        </mesh>
        <mesh position={[0.24, -0.33, 0.03]} rotation={[0, 0, -0.75]}>
          <boxGeometry args={[0.09, 0.022, 0.004]} />
          <meshBasicMaterial color="white" />
        </mesh>
      </group>
    </Float>
  )
}

/** Eases the camera toward the pointer for gentle parallax. */
function CameraRig({ animate }: { animate: boolean }) {
  const target = useMemo(() => new THREE.Vector3(0, -0.15, 0), [])
  useFrame(({ camera, pointer }, delta) => {
    if (!animate) return
    const k = 1 - Math.exp(-delta * 2.2)
    camera.position.x += (pointer.x * 0.9 - camera.position.x) * k
    camera.position.y += (0.45 + pointer.y * 0.45 - camera.position.y) * k
    camera.lookAt(target)
  })
  return null
}

export default function RelayScene({ animate = true }: { animate?: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.45, 7.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={animate ? 'always' : 'demand'}
      aria-hidden="true"
    >
      <fog attach="fog" args={['#343b1c', 9, 18]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} color="#fff6e8" />
      <directionalLight position={[-4, 2, -2]} intensity={0.5} color={OLIVE_LIGHT} />
      <group position={[0, -0.35, 0]}>
        <Track />
        <ThreadRunner animate={animate} />
        <Station x={-2.7} initials="AR" name="Asha Rao" role="Hands over" ring={CARAMEL} />
        <Station x={2.7} initials="RM" name="Ravi Menon" role="Receives" ring={OLIVE_LIGHT} />
        {docs.map((d, i) => <Document key={i} pos={d.pos} rot={d.rot} i={i} />)}
      </group>
      <Sparkles count={70} scale={[9, 5, 4]} size={2.2} speed={animate ? 0.35 : 0} color="#ecd8bd" opacity={0.7} />
      <CameraRig animate={animate} />
    </Canvas>
  )
}
