import abSchoolRankings from './lib/data/ab-school-rankings.json' assert { type: 'json' };
import bcSchoolRankings from './lib/data/bc-school-rankings.json' assert { type: 'json' };
import nbSchoolRankings from './lib/data/nb-school-rankings.json' assert { type: 'json' };
import onSchoolRankings from './lib/data/on-school-rankings.json' assert { type: 'json' };
import qcSchoolRankings from './lib/data/qc-school-rankings.json' assert { type: 'json' };

function pickSchools(source) {
  const raw = source;
  if (!Array.isArray(raw.schools)) return [];

  return raw.schools
    .map((school) => {
      if (
        typeof school.id !== 'string' ||
        typeof school.schoolName !== 'string' ||
        typeof school.city !== 'string' ||
        typeof school.province !== 'string'
      ) {
        return null;
      }

      return {
        id: school.id,
        schoolName: school.schoolName,
        city: school.city,
        province: school.province,
        rating: school.rating
      };
    })
    .filter((school) => school !== null);
}

const ALL_SCHOOLS = [
  ...pickSchools(abSchoolRankings),
  ...pickSchools(bcSchoolRankings),
  ...pickSchools(nbSchoolRankings),
  ...pickSchools(onSchoolRankings),
  ...pickSchools(qcSchoolRankings),
];

// Check St. Therese of Lisieux (the school the user was testing with)
const sample = ALL_SCHOOLS.find(s => s.schoolName.includes('Therese'));
console.log('Sample School picked by ANALYZER_SCHOOL_OPTIONS:', sample);
