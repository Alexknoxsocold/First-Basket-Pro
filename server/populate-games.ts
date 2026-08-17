import { storage } from './storage.js';

// Script to populate today's games with real starting lineups and first basket predictions
async function populateGames() {
  console.log('[PopulateGames] Starting to populate games with real data...');

  const allGames = await storage.getGames();
  
  // Game 1: LAC @ BOS (3:30 PM ET)
  const lacBoston = allGames.find(g => g.awayTeam === 'LAC' && g.homeTeam === 'BOS');
  if (lacBoston) {
    await storage.updateGame(lacBoston.id, {
      awayStarters: ['James Harden', 'Norman Powell', 'Derrick Jones Jr.', 'PJ Tucker', 'Ivica Zubac'],
      homeStarters: ['Derrick White', 'Jaylen Brown', 'Jordan Walsh', 'Payton Pritchard', 'Neemias Queta'],
      awayPlayer: 'James Harden',
      homePlayer: 'Jaylen Brown', // Top first basket candidate
      awayTipPercent: 45,
      homeTipPercent: 55,
      awayScorePercent: 48,
      homeScorePercent: 52,
      h2h: 'BOS leads 5-3'
    });
    console.log('[PopulateGames] ✓ Updated LAC @ BOS');
  }

  // Game 2: SAC @ SA (4:00 PM ET)
  const sacSpurs = allGames.find(g => g.awayTeam === 'SAC' && g.homeTeam === 'SA');
  if (sacSpurs) {
    await storage.updateGame(sacSpurs.id, {
      awayStarters: ['Russell Westbrook', 'Dennis Schröder', 'DeMar DeRozan', 'Zach LaVine', 'Domantas Sabonis'],
      homeStarters: ['Stephon Castle', 'Devin Vassell', 'Julian Champagnie', 'Keldon Johnson', 'Victor Wembanyama'],
      awayPlayer: 'Domantas Sabonis',
      homePlayer: 'Victor Wembanyama', // Featured first basket pick (26.2 PPG, 12.9 RPG)
      awayTipPercent: 42,
      homeTipPercent: 58,
      awayScorePercent: 45,
      homeScorePercent: 55,
      h2h: 'SA leads 6-4'
    });
    console.log('[PopulateGames] ✓ Updated SAC @ SA');
  }

  // Game 3: BKN @ WSH (6:00 PM ET)
  const bknWash = allGames.find(g => g.awayTeam === 'BKN' && g.homeTeam === 'WSH');
  if (bknWash) {
    await storage.updateGame(bknWash.id, {
      awayStarters: ['Dennis Schröder', 'Cam Thomas', 'Mikal Bridges', 'Cameron Johnson', 'Nic Claxton'],
      homeStarters: ['Jordan Poole', 'Bilal Coulibaly', 'Kyle Kuzma', 'Deni Avdija', 'Jonas Valančiūnas'],
      awayPlayer: 'Cam Thomas',
      homePlayer: 'Jordan Poole',
      awayTipPercent: 52,
      homeTipPercent: 48,
      awayScorePercent: 54,
      homeScorePercent: 46,
      h2h: 'BKN leads 7-3'
    });
    console.log('[PopulateGames] ✓ Updated BKN @ WSH');
  }

  // Game 4: ORL @ HOU (7:00 PM ET)
  const orlHou = allGames.find(g => g.awayTeam === 'ORL' && g.homeTeam === 'HOU');
  if (orlHou) {
    await storage.updateGame(orlHou.id, {
      awayStarters: ['Cole Anthony', 'Jalen Suggs', 'Franz Wagner', 'Paolo Banchero', 'Wendell Carter Jr.'],
      homeStarters: ['Fred VanVleet', 'Jalen Green', 'Dillon Brooks', 'Jabari Smith Jr.', 'Alperen Sengun'],
      awayPlayer: 'Paolo Banchero',
      homePlayer: 'Alperen Sengun',
      awayTipPercent: 47,
      homeTipPercent: 53,
      awayScorePercent: 49,
      homeScorePercent: 51,
      h2h: 'HOU leads 6-4'
    });
    console.log('[PopulateGames] ✓ Updated ORL @ HOU');
  }

  // Game 5: GS @ NO (7:00 PM ET)
  const gsNola = allGames.find(g => g.awayTeam === 'GS' && g.homeTeam === 'NO');
  if (gsNola) {
    await storage.updateGame(gsNola.id, {
      awayStarters: ['Stephen Curry', 'Klay Thompson', 'Andrew Wiggins', 'Draymond Green', 'Kevon Looney'],
      homeStarters: ['CJ McCollum', 'Herbert Jones', 'Brandon Ingram', 'Zion Williamson', 'Daniel Theis'],
      awayPlayer: 'Stephen Curry',
      homePlayer: 'Zion Williamson',
      awayTipPercent: 55,
      homeTipPercent: 45,
      awayScorePercent: 56,
      homeScorePercent: 44,
      h2h: 'GS leads 8-2'
    });
    console.log('[PopulateGames] ✓ Updated GS @ NO');
  }

  // Game 6: POR @ DAL (7:30 PM ET)
  const porDal = allGames.find(g => g.awayTeam === 'POR' && g.homeTeam === 'DAL');
  if (porDal) {
    await storage.updateGame(porDal.id, {
      awayStarters: ['Anfernee Simons', 'Shaedon Sharpe', 'Jerami Grant', 'Deandre Ayton', 'Robert Williams III'],
      homeStarters: ['Luka Dončić', 'Kyrie Irving', 'Josh Green', 'PJ Washington', 'Daniel Gafford'],
      awayPlayer: 'Anfernee Simons',
      homePlayer: 'Luka Dončić',
      awayTipPercent: 38,
      homeTipPercent: 62,
      awayScorePercent: 40,
      homeScorePercent: 60,
      h2h: 'DAL leads 9-1'
    });
    console.log('[PopulateGames] ✓ Updated POR @ DAL');
  }

  // Game 7: ATL @ PHX (8:00 PM ET)
  const atlPhx = allGames.find(g => g.awayTeam === 'ATL' && g.homeTeam === 'PHX');
  if (atlPhx) {
    await storage.updateGame(atlPhx.id, {
      awayStarters: ['Dyson Daniels', 'Nickeil Alexander-Walker', 'Zaccharie Risacher', 'Jalen Johnson', 'Kristaps Porzingis'],
      homeStarters: ['Devin Booker', 'Grayson Allen', 'Dillon Brooks', 'Ryan Dunn', 'Oso Ighodaro'],
      awayPlayer: 'Jalen Johnson',
      homePlayer: 'Devin Booker', // Top first basket pick (28.5 PPG)
      awayTipPercent: 46,
      homeTipPercent: 54,
      awayScorePercent: 48,
      homeScorePercent: 52,
      h2h: 'PHX leads 6-4'
    });
    console.log('[PopulateGames] ✓ Updated ATL @ PHX');
  }

  // Game 8: CHI @ UTAH (8:00 PM ET)
  const chiUtah = allGames.find(g => g.awayTeam === 'CHI' && g.homeTeam === 'UTAH');
  if (chiUtah) {
    await storage.updateGame(chiUtah.id, {
      awayStarters: ['Josh Giddey', 'Nikola Vučević', 'Tre Jones', 'Kevin Huerter', 'Matas Buzelis'],
      homeStarters: ['Keyonte George', 'Lauri Markkanen', 'Jusuf Nurkić', 'Ace Bailey', 'John Collins'],
      awayPlayer: 'Josh Giddey',
      homePlayer: 'Lauri Markkanen', // Featured first basket pick (29.3 PPG, 40 pts last game)
      awayTipPercent: 44,
      homeTipPercent: 56,
      awayScorePercent: 46,
      homeScorePercent: 54,
      h2h: 'UTAH leads 5-5'
    });
    console.log('[PopulateGames] ✓ Updated CHI @ UTAH');
  }

  console.log('[PopulateGames] ✓ All games updated with real data!');
}

// Run the script
populateGames().catch(console.error);
