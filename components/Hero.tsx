type TP = { x: number; y: number; h: number; r: number };

function Turbine({ x, y, h, r }: TP) {
  return (
    <g transform={`translate(${x} ${y})`} fill="#151515">
      <path d={`M${-h * 0.02} 0 L${-h * 0.008} ${-h} L${h * 0.008} ${-h} L${h * 0.02} 0Z`} />
      <g transform={`translate(0 ${-h}) rotate(${r})`}>
        {[0, 120, 240].map((a) => (
          <path key={a} transform={`rotate(${a})`} d={`M0 0 C${h * 0.03} ${-h * 0.12} ${h * 0.02} ${-h * 0.3} 0 ${-h * 0.42} C${-h * 0.02} ${-h * 0.3} ${-h * 0.025} ${-h * 0.1} 0 0Z`} />
        ))}
        <circle r={h * 0.028} />
      </g>
    </g>
  );
}

export default function Hero() {
  return (
    <svg viewBox="0 0 900 380" role="img" aria-label="Il·lustració: aerogeneradors gegants davant d’un turó amb un castell i una au en vol">
      <path d="M0 310 C120 230 260 250 380 290 C470 250 560 260 640 300 L900 300 V380 H0Z" fill="#c9cbb0" />
      <path d="M380 330 C520 160 640 130 770 215 C830 250 870 255 900 255 V380 H380Z" fill="#c9cbb0" stroke="#151515" strokeWidth="2" />
      <path d="M612 150 h46 v-14 h-7 v8 h-8 v-8 h-8 v8 h-8 v-8 h-8 v8 h-7z" fill="#d8322a" />
      <path d="M810 70 q18 -14 36 0 q-18 -6 -36 0z M826 66 l-10 -16 l22 14z" fill="#151515" />
      <g fill="none" stroke="#2e7d32" strokeWidth="7" strokeLinecap="round">
        <path d="M560 215 q22 22 0 44" /><path d="M585 205 q30 32 0 64" /><path d="M610 195 q38 42 0 84" />
      </g>
      <Turbine x={110} y={310} h={210} r={15} />
      <Turbine x={230} y={296} h={300} r={70} />
      <Turbine x={350} y={300} h={190} r={40} />
      <Turbine x={470} y={296} h={250} r={100} />
      <line x1="0" y1="318" x2="900" y2="318" stroke="#151515" strokeWidth="2" />
    </svg>
  );
}
