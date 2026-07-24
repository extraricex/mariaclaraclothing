const test = require('node:test');
const assert = require('node:assert/strict');

function address(overrides = {}) {
  return {
    houseAddress: '123 Sample Street',
    provinceCode: 'CAVITE',
    province: 'Cavite',
    cityCode: 'CAVITE|IMUS',
    city: 'Imus City',
    barangayCode: 'CAVITE|IMUS|BUCANDALA IV',
    barangay: 'Bucandala IV',
    postalCode: '4103',
    ...overrides
  };
}

function dependencies() {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const repository = require('../src/integrations/pancake/pancakeGeoRepository');
  const service = require('../src/integrations/pancake/pancakeGeoService');
  repository.resetMemoryForTests();
  service.clearGeoCacheForTests();
  const calls = [];
  const client = {
    listProvinces: async (countryCode) => {
      calls.push(['provinces', countryCode]);
      return [{ id: '63_826', name: 'Cavite', nameEn: 'Cavite', code: '' }];
    },
    listDistricts: async (provinceId) => {
      calls.push(['districts', provinceId]);
      return [{ id: '63_8261588', name: 'Imus', nameEn: 'Imus', provinceId }];
    },
    listCommunes: async (provinceId, districtId) => {
      calls.push(['communes', provinceId, districtId]);
      return [
        { id: 'I', name: 'Bucandala i', provinceId, districtId },
        { id: 'II', name: 'Bucandala ii', provinceId, districtId },
        { id: 'III', name: 'Bucandala iii', provinceId, districtId },
        { id: '63_82615881238', name: 'Bucandala iv', provinceId, districtId }
      ];
    }
  };
  return {
    calls, client, repository, service,
    restore() {
      service.clearGeoCacheForTests();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  };
}

test('resolves Cavite, Imus, and Bucandala IV through the exact parent hierarchy', async () => {
  const deps = dependencies();
  try {
    const result = await deps.service.resolvePancakeAddress(address(), {
      client: deps.client,
      repository: deps.repository
    });
    assert.equal(result.countryCode, '63');
    assert.equal(result.province.id, '63_826');
    assert.equal(result.district.id, '63_8261588');
    assert.equal(result.commune.id, '63_82615881238');
    assert.equal(result.district.matchMethod, 'approved_alias');
    assert.deepEqual(deps.calls, [
      ['provinces', '63'],
      ['districts', '63_826'],
      ['communes', '63_826', '63_8261588']
    ]);

    const saved = await deps.repository.listMappings();
    assert.equal(saved.length, 3);
    assert.ok(saved.every((item) => item.verificationStatus === 'auto_matched'));
  } finally { deps.restore(); }
});

test('Roman numeral barangays remain distinct and verified mappings are reused', async () => {
  const deps = dependencies();
  try {
    const first = await deps.service.resolvePancakeAddress(address(), {
      client: deps.client,
      repository: deps.repository
    });
    const second = await deps.service.resolvePancakeAddress(address(), {
      client: deps.client,
      repository: deps.repository
    });
    assert.equal(first.commune.id, '63_82615881238');
    assert.equal(second.commune.id, '63_82615881238');
    assert.equal(second.commune.matchMethod, 'stored_id');
    assert.equal(deps.calls.filter(([type]) => type === 'communes').length, 1);
  } finally { deps.restore(); }
});

test('an unknown or ambiguous barangay blocks instead of selecting the first result', async () => {
  const deps = dependencies();
  try {
    await assert.rejects(
      deps.service.resolvePancakeAddress(address({
        barangayCode: 'CAVITE|IMUS|NOT REAL', barangay: 'Not Real'
      }), { client: deps.client, repository: deps.repository }),
      (error) => error.code === 'pancake_commune_not_found' && error.field === 'commune'
    );
    const failures = await deps.repository.listMappings({ status: 'not_found' });
    assert.equal(failures.length, 1);
    assert.equal(failures[0].pancakeId, '');
  } finally { deps.restore(); }
});

test('maps PSGC Daang Hari to Pancake Daan Hari only inside the resolved district', async () => {
  const deps = dependencies();
  try {
    deps.client.listCommunes = async (provinceId, districtId) => {
      deps.calls.push(['communes', provinceId, districtId]);
      return [
        { id: 'north', name: 'North daan hari', provinceId, districtId },
        { id: 'south', name: 'South daang hari', provinceId, districtId }
      ];
    };
    const mapping = await deps.service.resolvePancakeAddress(address({
      barangayCode: 'CAVITE|IMUS|NORTH DAANG HARI',
      barangay: 'North Daang Hari'
    }), { client: deps.client, repository: deps.repository });
    assert.equal(mapping.commune.id, 'north');
    assert.equal(mapping.commune.name, 'North daan hari');
    assert.equal(mapping.commune.matchMethod, 'approved_alias');
  } finally { deps.restore(); }
});

test('refreshes Pancake geo data once before declaring a location missing', async () => {
  const deps = dependencies();
  let communeLoads = 0;
  try {
    deps.client.listCommunes = async (provinceId, districtId) => {
      deps.calls.push(['communes', provinceId, districtId]);
      communeLoads += 1;
      return communeLoads === 1 ? [] : [
        { id: 'fresh', name: 'Fresh Barangay', provinceId, districtId }
      ];
    };
    const mapping = await deps.service.resolvePancakeAddress(address({
      barangayCode: 'CAVITE|IMUS|FRESH BARANGAY',
      barangay: 'Fresh Barangay'
    }), { client: deps.client, repository: deps.repository });
    assert.equal(mapping.commune.id, 'fresh');
    assert.equal(communeLoads, 2);
  } finally { deps.restore(); }
});

test('manual mapping validates the selected Province, District, and Commune hierarchy', async () => {
  const deps = dependencies();
  try {
    const mapping = await deps.service.saveManualPancakeAddressMapping(address(), {
      provinceId: '63_826',
      districtId: '63_8261588',
      communeId: '63_82615881238'
    }, { client: deps.client, repository: deps.repository });
    assert.equal(mapping.commune.id, '63_82615881238');
    const saved = await deps.repository.listMappings();
    assert.ok(saved.every((item) => item.verificationStatus === 'manually_verified'));

    await assert.rejects(
      deps.service.saveManualPancakeAddressMapping(address(), {
        provinceId: '63_826', districtId: 'wrong', communeId: 'I'
      }, { client: deps.client, repository: deps.repository }),
      (error) => error.code === 'pancake_manual_mapping_invalid_hierarchy'
    );
  } finally { deps.restore(); }
});
