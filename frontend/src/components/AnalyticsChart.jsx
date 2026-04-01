import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export default function AnalyticsChart({ data, players, selectedPlayer }) {
  const filteredPlayers = selectedPlayer === 'ALL' ? players : [selectedPlayer];

  return (
    <LineChart width={600} height={300} data={data}>
      <XAxis dataKey="match" />
      <YAxis reversed />
      <Tooltip />
      <Legend />
      {filteredPlayers.map((player) => (
        <Line key={player} type="monotone" dataKey={player} />
      ))}
    </LineChart>
  );
}
