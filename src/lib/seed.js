// DEMO SEED DATA — clearly labeled demo scaffolding.
// The field is the Jan 2026 playoffs (2025 NFL season). Player names are best-effort
// for that season's rosters. In January, replace TEAMS / PLAYERS with the real
// playoff field once it's set. Teams-alive-by-round reflects the actual Jan 2026
// results for demo purposes.

function slug(name) {
	return name
		.toLowerCase()
		.replace(/['’.]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

export const TEAMS = [
	{ abbr: 'DEN', name: 'Denver Broncos', conf: 'AFC', seed: 1 },
	{ abbr: 'NE', name: 'New England Patriots', conf: 'AFC', seed: 2 },
	{ abbr: 'JAX', name: 'Jacksonville Jaguars', conf: 'AFC', seed: 3 },
	{ abbr: 'PIT', name: 'Pittsburgh Steelers', conf: 'AFC', seed: 4 },
	{ abbr: 'HOU', name: 'Houston Texans', conf: 'AFC', seed: 5 },
	{ abbr: 'BUF', name: 'Buffalo Bills', conf: 'AFC', seed: 6 },
	{ abbr: 'LAC', name: 'Los Angeles Chargers', conf: 'AFC', seed: 7 },
	{ abbr: 'SEA', name: 'Seattle Seahawks', conf: 'NFC', seed: 1 },
	{ abbr: 'CHI', name: 'Chicago Bears', conf: 'NFC', seed: 2 },
	{ abbr: 'PHI', name: 'Philadelphia Eagles', conf: 'NFC', seed: 3 },
	{ abbr: 'CAR', name: 'Carolina Panthers', conf: 'NFC', seed: 4 },
	{ abbr: 'LAR', name: 'Los Angeles Rams', conf: 'NFC', seed: 5 },
	{ abbr: 'SF', name: 'San Francisco 49ers', conf: 'NFC', seed: 6 },
	{ abbr: 'GB', name: 'Green Bay Packers', conf: 'NFC', seed: 7 }
];

// [name, position] per team — every team has QB/RB/WR/TE options so any
// 3 QB / 4 RB / 4 WR / 3 TE split across 14 teams is actually buildable.
const ROSTERS = {
	DEN: [
		['Bo Nix', 'QB'], ['Jarrett Stidham', 'QB'],
		['RJ Harvey', 'RB'], ['J.K. Dobbins', 'RB'],
		['Courtland Sutton', 'WR'], ['Troy Franklin', 'WR'], ['Marvin Mims Jr.', 'WR'],
		['Evan Engram', 'TE'], ['Adam Trautman', 'TE']
	],
	NE: [
		['Drake Maye', 'QB'], ['Joshua Dobbs', 'QB'],
		['TreVeyon Henderson', 'RB'], ['Rhamondre Stevenson', 'RB'],
		['Stefon Diggs', 'WR'], ['Kayshon Boutte', 'WR'], ['DeMario Douglas', 'WR'],
		['Hunter Henry', 'TE'], ['Austin Hooper', 'TE']
	],
	JAX: [
		['Trevor Lawrence', 'QB'],
		['Travis Etienne Jr.', 'RB'], ['Bhayshul Tuten', 'RB'],
		['Brian Thomas Jr.', 'WR'], ['Parker Washington', 'WR'], ['Jakobi Meyers', 'WR'],
		['Brenton Strange', 'TE'], ['Johnny Mundt', 'TE']
	],
	PIT: [
		['Aaron Rodgers', 'QB'], ['Mason Rudolph', 'QB'],
		['Jaylen Warren', 'RB'], ['Kenneth Gainwell', 'RB'],
		['DK Metcalf', 'WR'], ['Calvin Austin III', 'WR'], ['Roman Wilson', 'WR'],
		['Pat Freiermuth', 'TE'], ['Jonnu Smith', 'TE']
	],
	HOU: [
		['C.J. Stroud', 'QB'], ['Davis Mills', 'QB'],
		['Woody Marks', 'RB'], ['Nick Chubb', 'RB'],
		['Nico Collins', 'WR'], ['Jayden Higgins', 'WR'], ['Christian Kirk', 'WR'],
		['Dalton Schultz', 'TE'], ['Cade Stover', 'TE']
	],
	BUF: [
		['Josh Allen', 'QB'], ['Mitchell Trubisky', 'QB'],
		['James Cook', 'RB'], ['Ray Davis', 'RB'],
		['Khalil Shakir', 'WR'], ['Keon Coleman', 'WR'], ['Joshua Palmer', 'WR'],
		['Dalton Kincaid', 'TE'], ['Dawson Knox', 'TE']
	],
	LAC: [
		['Justin Herbert', 'QB'],
		['Omarion Hampton', 'RB'], ['Kimani Vidal', 'RB'],
		['Ladd McConkey', 'WR'], ['Keenan Allen', 'WR'], ['Quentin Johnston', 'WR'],
		['Oronde Gadsden II', 'TE'], ['Tyler Conklin', 'TE']
	],
	SEA: [
		['Sam Darnold', 'QB'], ['Drew Lock', 'QB'],
		['Kenneth Walker III', 'RB'], ['Zach Charbonnet', 'RB'],
		['Jaxon Smith-Njigba', 'WR'], ['Cooper Kupp', 'WR'], ['Rashid Shaheed', 'WR'],
		['AJ Barner', 'TE'], ['Elijah Arroyo', 'TE']
	],
	CHI: [
		['Caleb Williams', 'QB'], ['Tyson Bagent', 'QB'],
		["D'Andre Swift", 'RB'], ['Kyle Monangai', 'RB'],
		['DJ Moore', 'WR'], ['Rome Odunze', 'WR'], ['Luther Burden III', 'WR'],
		['Cole Kmet', 'TE'], ['Colston Loveland', 'TE']
	],
	PHI: [
		['Jalen Hurts', 'QB'], ['Tanner McKee', 'QB'],
		['Saquon Barkley', 'RB'], ['Tank Bigsby', 'RB'],
		['A.J. Brown', 'WR'], ['DeVonta Smith', 'WR'], ['Jahan Dotson', 'WR'],
		['Dallas Goedert', 'TE'], ['Grant Calcaterra', 'TE']
	],
	CAR: [
		['Bryce Young', 'QB'], ['Andy Dalton', 'QB'],
		['Rico Dowdle', 'RB'], ['Chuba Hubbard', 'RB'],
		['Tetairoa McMillan', 'WR'], ['Xavier Legette', 'WR'], ['Jalen Coker', 'WR'],
		["Ja'Tavion Sanders", 'TE'], ['Tommy Tremble', 'TE']
	],
	LAR: [
		['Matthew Stafford', 'QB'], ['Jimmy Garoppolo', 'QB'],
		['Kyren Williams', 'RB'], ['Blake Corum', 'RB'],
		['Puka Nacua', 'WR'], ['Davante Adams', 'WR'], ['Xavier Smith', 'WR'],
		['Tyler Higbee', 'TE'], ['Colby Parkinson', 'TE']
	],
	SF: [
		['Brock Purdy', 'QB'], ['Mac Jones', 'QB'],
		['Christian McCaffrey', 'RB'], ['Brian Robinson Jr.', 'RB'],
		['Jauan Jennings', 'WR'], ['Ricky Pearsall', 'WR'], ['Kendrick Bourne', 'WR'],
		['George Kittle', 'TE'], ['Jake Tonges', 'TE']
	],
	GB: [
		['Jordan Love', 'QB'], ['Malik Willis', 'QB'],
		['Josh Jacobs', 'RB'], ['Emanuel Wilson', 'RB'],
		['Christian Watson', 'WR'], ['Romeo Doubs', 'WR'], ['Jayden Reed', 'WR'],
		['Tucker Kraft', 'TE'], ['Luke Musgrave', 'TE']
	]
};

export const PLAYERS = Object.entries(ROSTERS).flatMap(([team, players]) =>
	players.map(([name, position]) => ({ id: `${team.toLowerCase()}-${slug(name)}`, name, team, position }))
);

// Teams playing in each round (demo: actual Jan 2026 results).
// WC excludes the two #1 seeds on bye; later rounds are the actual survivors.
export const TEAMS_BY_ROUND = {
	WC: ['NE', 'JAX', 'PIT', 'HOU', 'BUF', 'LAC', 'CHI', 'PHI', 'CAR', 'LAR', 'SF', 'GB'],
	DIV: ['DEN', 'NE', 'BUF', 'HOU', 'SEA', 'CHI', 'LAR', 'SF'],
	CONF: ['DEN', 'NE', 'SEA', 'LAR'],
	SB: ['SEA', 'NE']
};

// SAMPLE stat lines (Wild Card round) used ONLY by the demo-scores tooling /
// /api/admin/seed-scores endpoint so the leaderboard can be demoed end to end.
// These are illustrative, not official stats. Wipe them with POST /api/admin/seed.
export const SAMPLE_WC_STATLINES = [
	{ playerId: 'buf-josh-allen', round: 'WC', statLine: { pass_yd: 273, pass_td: 1, pass_int: 0, rush_yd: 33, rush_td: 2, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'buf-james-cook', round: 'WC', statLine: { pass_yd: 0, pass_td: 0, pass_int: 0, rush_yd: 46, rush_td: 0, rec: 2, rec_yd: 5, rec_td: 0, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'ne-drake-maye', round: 'WC', statLine: { pass_yd: 268, pass_td: 1, pass_int: 1, rush_yd: 66, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'hou-cj-stroud', round: 'WC', statLine: { pass_yd: 250, pass_td: 1, pass_int: 1, rush_yd: 8, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 1, two_pt: 0 } },
	{ playerId: 'lar-matthew-stafford', round: 'WC', statLine: { pass_yd: 304, pass_td: 3, pass_int: 1, rush_yd: 0, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'lar-puka-nacua', round: 'WC', statLine: { pass_yd: 0, pass_td: 0, pass_int: 0, rush_yd: 14, rush_td: 1, rec: 10, rec_yd: 111, rec_td: 1, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'sf-christian-mccaffrey', round: 'WC', statLine: { pass_yd: 0, pass_td: 0, pass_int: 0, rush_yd: 48, rush_td: 1, rec: 6, rec_yd: 29, rec_td: 1, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'phi-saquon-barkley', round: 'WC', statLine: { pass_yd: 0, pass_td: 0, pass_int: 0, rush_yd: 106, rush_td: 0, rec: 3, rec_yd: 25, rec_td: 0, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'chi-caleb-williams', round: 'WC', statLine: { pass_yd: 361, pass_td: 2, pass_int: 2, rush_yd: 20, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0, two_pt: 0 } },
	{ playerId: 'gb-jordan-love', round: 'WC', statLine: { pass_yd: 323, pass_td: 4, pass_int: 0, rush_yd: 11, rush_td: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0, two_pt: 0 } }
];
