const ink = "var(--color-text-primary)";
const mute = "var(--color-text-secondary)";
const line = "var(--color-border)";

function Box({
  x,
  y,
  w,
  h,
  label,
  quiet = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  quiet?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={quiet ? mute : ink}
        strokeWidth={1}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 4}
        textAnchor="middle"
        fill={quiet ? mute : ink}
        style={{ fontFamily: "var(--font-family-body)", fontSize: 13 }}
      >
        {label}
      </text>
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const id = `a-${x1}-${y1}-${x2}-${y2}`;
  return (
    <g>
      <defs>
        <marker id={id} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6" fill="none" stroke={ink} strokeWidth={1} />
        </marker>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={ink}
        strokeWidth={1}
        markerEnd={`url(#${id})`}
      />
    </g>
  );
}

export function DiagramLoop() {
  return (
    <svg viewBox="0 0 720 120" width="100%" height="auto" role="img" aria-label="Authorize, copy, bot, shop, fire">
      <Box x={8} y={36} w={120} h={48} label="Authorize" />
      <Arrow x1={132} y1={60} x2={156} y2={60} />
      <Box x={160} y={36} w={100} h={48} label="Copy" />
      <Arrow x1={264} y1={60} x2={288} y2={60} />
      <Box x={292} y={36} w={100} h={48} label="Your bot" />
      <Arrow x1={396} y1={60} x2={420} y2={60} />
      <Box x={424} y={36} w={100} h={48} label="Shop" />
      <Arrow x1={528} y1={60} x2={552} y2={60} />
      <Box x={556} y={36} w={152} h={48} label="Fire → 403" />
    </svg>
  );
}

export function DiagramChain() {
  return (
    <svg viewBox="0 0 720 140" width="100%" height="auto" role="img" aria-label="You, then a narrower helper">
      <Box x={8} y={46} w={140} h={48} label="You" />
      <Arrow x1={152} y1={70} x2={188} y2={70} />
      <Box x={192} y={46} w={180} h={48} label="Root (MetaMask)" />
      <Arrow x1={376} y1={70} x2={412} y2={70} />
      <Box x={416} y={20} w={140} h={48} label="Memo hop" />
      <Box x={416} y={80} w={140} h={48} label="Translate hop" quiet />
      <Arrow x1={560} y1={44} x2={588} y2={44} />
      <Box x={592} y={20} w={120} h={48} label="Helper" />
      <text
        x={360}
        y={132}
        textAnchor="middle"
        fill={mute}
        style={{ fontFamily: "var(--font-family-body)", fontSize: 12 }}
      >
        Each hop can only get narrower
      </text>
    </svg>
  );
}

export function DiagramSees() {
  const rows = [
    ["You", "The key. Fire."],
    ["Warrant", "The witness, on this host."],
    ["The chat", "The bearer."],
    ["The shop", "A nullifier."],
  ];
  return (
    <svg viewBox="0 0 720 208" width="100%" height="auto" role="img" aria-label="Who sees what">
      {rows.map(([who, saw], i) => (
        <g key={who}>
          <line x1={8} y1={4 + i * 48} x2={712} y2={4 + i * 48} stroke={line} strokeWidth={1} />
          <text
            x={24}
            y={38 + i * 48}
            fill={ink}
            style={{ fontFamily: "var(--font-family-heading)", fontSize: 14, fontWeight: 600 }}
          >
            {who}
          </text>
          <text
            x={200}
            y={38 + i * 48}
            fill={mute}
            style={{ fontFamily: "var(--font-family-body)", fontSize: 14 }}
          >
            {saw}
          </text>
        </g>
      ))}
      <line x1={8} y1={196} x2={712} y2={196} stroke={line} strokeWidth={1} />
    </svg>
  );
}

export function DiagramFire() {
  return (
    <svg viewBox="0 0 720 168" width="100%" height="auto" role="img" aria-label="Fire kills every hop">
      <text
        x={8}
        y={18}
        fill={mute}
        style={{ fontFamily: "var(--font-family-body)", fontSize: 12 }}
      >
        Before
      </text>
      <Box x={8} y={32} w={100} h={40} label="Root" />
      <Arrow x1={112} y1={52} x2={136} y2={52} />
      <Box x={140} y={32} w={100} h={40} label="Hop" />
      <Arrow x1={244} y1={52} x2={268} y2={52} />
      <Box x={272} y={32} w={100} h={40} label="Helper" />
      <text
        x={8}
        y={100}
        fill={mute}
        style={{ fontFamily: "var(--font-family-body)", fontSize: 12 }}
      >
        After Fire
      </text>
      <Box x={8} y={114} w={100} h={40} label="Revoked" quiet />
      <Arrow x1={112} y1={134} x2={136} y2={134} />
      <Box x={140} y={114} w={100} h={40} label="403" quiet />
      <Arrow x1={244} y1={134} x2={268} y2={134} />
      <Box x={272} y={114} w={100} h={40} label="403" quiet />
      <text
        x={500}
        y={88}
        fill={ink}
        style={{ fontFamily: "var(--font-family-body)", fontSize: 13 }}
      >
        One epoch bump. Every hop dies.
      </text>
    </svg>
  );
}
