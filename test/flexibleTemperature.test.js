const { expect } = require('chai');

const { extractMaybeTemperatureStrings, extractFloats, hasGranularTemperatures, lookup } = require('../helpers/flexibleTemperatureDataUtils.js');

describe('extractMaybeTemperatureStrings', () => {
  it('reads all digits', () => {
    expect(extractMaybeTemperatureStrings({
      on: 'ON',
      off: 'OFF',
      temperature16: {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_16'
      },
      temperature18: {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_18'
      },
      temperature23: {
        'pseudo-mode': 'heat',
        'data': 'TEMPERATURE_23'
      },
    }, 'temperature')).to.eql(['16', '18', '23']);
  })

  it('reads digits and a dot', () => {
    expect(extractMaybeTemperatureStrings({
      on: 'ON',
      off: 'OFF',
      'temperature21.1': {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_70F'
      },
      'temperature21.7': {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_71F'
      },
      'temperature22.2': {
        'pseudo-mode': 'heat',
        'data': 'TEMPERATURE_72F'
      },
    }, 'temperature')).to.eql(['21.1', '21.7', '22.2']);
  })
});

describe('extractFloats', () => {
  it('parses all digits', () => {
    expect(extractFloats({
      on: 'ON',
      off: 'OFF',
      temperature16: {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_16'
      },
      temperature18: {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_18'
      },
      temperature23: {
        'pseudo-mode': 'heat',
        'data': 'TEMPERATURE_23'
      },
    }, 'temperature')).to.eql([16, 18, 23]);
  })

  it('parses digits with a decimal point', () => {
    expect(extractFloats({
      on: 'ON',
      off: 'OFF',
      'temperature21.1': {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_70F'
      },
      'temperature21.7': {
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_71F'
      },
      'temperature22.2': {
        'pseudo-mode': 'heat',
        'data': 'TEMPERATURE_72F'
      },
    }, 'temperature')).to.eql([21.1, 21.7, 22.2]);
  })

  it('disregards fuzzy values', () => {
    expect(extractFloats({
      on: 'ON',
      off: 'OFF',
      'temperature 21.1': { // has a space in the middle; should be ignored
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_70F'
      },
      'temperature21.7 ': { // has a space in the end; should be ignored
        'pseudo-mode': 'cool',
        'data': 'TEMPERATURE_71F'
      },
      'temperature22.2': {
        'pseudo-mode': 'heat',
        'data': 'TEMPERATURE_72F'
      },
    }, 'temperature')).to.eql([/* 21.1, 21.7, */ 22.2]);
  })
});

describe('hasGranularTemperatures', () => {
  const data = {
    on: 'ON',
    off: 'OFF',
    temperature16: {
      'pseudo-mode': 'cool',
      'data': 'TEMPERATURE_16'
    },
    temperature18: {
      'pseudo-mode': 'cool',
      'data': 'TEMPERATURE_18'
    },
    temperature23: {
      'pseudo-mode': 'heat',
      'data': 'TEMPERATURE_23'
    },
    'heat23.0': { // if we also look into 'heat' prefix, this should return true
      'data': 'TEMPERATURE_23'
    }
  };

  it('returns false for [16,18,23]', () => {
    expect(hasGranularTemperatures(data, ['temperature'])).to.equal(false);
  })

  it('returns true for [16,18,23,23.0]', () => {
    expect(hasGranularTemperatures(data, ['temperature', 'heat'])).to.equal(true);
  })
});

describe('lookup', () => {
  const data = {
    on: 'ON',
    off: 'OFF',
    temperature16: {
      'pseudo-mode': 'cool',
      'data': 'TEMPERATURE_16'
    },
    temperature18: {
      'pseudo-mode': 'cool',
      'data': 'TEMPERATURE_18'
    },
    temperature23: {
      'pseudo-mode': 'heat',
      'data': 'TEMPERATURE_23'
    },
    'heat24.4': {
      'data': 'TEMPERATURE_76F'
    },
    'heat25': {
      'data': 'TEMPERATURE_77F'
    },
    'heat25.6': {
      'data': 'TEMPERATURE_78F'
    },
    'heat26.1': {
      'data': 'TEMPERATURE_79F'
    },
    'heat26.7': {
      'data': 'TEMPERATURE_80F'
    },
  };

  it('does exact integer lookups', () => {
    expect(lookup(data, 'temperature', 16).data).to.equal('TEMPERATURE_16');
    expect(lookup(data, 'temperature', 18).data).to.equal('TEMPERATURE_18');
    expect(lookup(data, 'temperature', 23).data).to.equal('TEMPERATURE_23');
  })

  it('does fuzzy lookups', () => {
    expect(lookup(data, 'heat', 24).data).to.equal('TEMPERATURE_76F');
    expect(lookup(data, 'heat', 24.0).data).to.equal('TEMPERATURE_76F');
    expect(lookup(data, 'heat', 24.1).data).to.equal('TEMPERATURE_76F');
    expect(lookup(data, 'heat', 24.2).data).to.equal('TEMPERATURE_76F');
    expect(lookup(data, 'heat', 24.3).data).to.equal('TEMPERATURE_76F');
    expect(lookup(data, 'heat', 24.4).data).to.equal('TEMPERATURE_76F');

    expect(lookup(data, 'heat', 24.8).data).to.equal('TEMPERATURE_77F');
    expect(lookup(data, 'heat', 24.9).data).to.equal('TEMPERATURE_77F');
    expect(lookup(data, 'heat', 25.0).data).to.equal('TEMPERATURE_77F');
    expect(lookup(data, 'heat', 25.1).data).to.equal('TEMPERATURE_77F');
    expect(lookup(data, 'heat', 25.2).data).to.equal('TEMPERATURE_77F');

    expect(lookup(data, 'heat', 25.5).data).to.equal('TEMPERATURE_78F');
    expect(lookup(data, 'heat', 25.6).data).to.equal('TEMPERATURE_78F');
    expect(lookup(data, 'heat', 25.7).data).to.equal('TEMPERATURE_78F');

    expect(lookup(data, 'heat', 26.0).data).to.equal('TEMPERATURE_79F');
    expect(lookup(data, 'heat', 26.1).data).to.equal('TEMPERATURE_79F');
    expect(lookup(data, 'heat', 26.2).data).to.equal('TEMPERATURE_79F');

    expect(lookup(data, 'heat', 26.6).data).to.equal('TEMPERATURE_80F');
    expect(lookup(data, 'heat', 26.7).data).to.equal('TEMPERATURE_80F');
    expect(lookup(data, 'heat', 26.8).data).to.equal('TEMPERATURE_80F');
  });

  it('returns null if the target is too far away from known values', () => {
    expect(lookup(data, 'heat', 9)).to.be.null;
    expect(lookup(data, 'heat', 27.7)).to.be.null;
  });

  it('does not throw if prefix is not defined', () => {
    expect(lookup(data, 'cool', 26)).to.be.null;
  });
});
