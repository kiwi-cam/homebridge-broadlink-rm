function extractMaybeTemperatureStrings(data, prefix) {
  return Object.keys(data)
    .filter(k => k.startsWith(prefix))
    .map(k => k.substring(prefix.length));
}

function extractFloats(data, prefix) {
  return extractMaybeTemperatureStrings(data, prefix)
    .map(parseFloat)
    .filter(num => `${prefix}${num}` in data);
}

function hasGranularTemperatures(data, prefixes) {
  return prefixes
    .flatMap(prefix => extractMaybeTemperatureStrings(data, prefix))
    .some(s => s.includes('.'));
}

function lookup(data, prefix, temperature) {
  const knownTemperatures = extractFloats(data, prefix);
  if (knownTemperatures.length === 0) {
    return null;
  }

  const closestKnownTemperature = knownTemperatures
    .reduce(function (prev, curr) {
      return (Math.abs(curr - temperature) < Math.abs(prev - temperature) ? curr : prev);
    });

  if (Math.abs(closestKnownTemperature - temperature) < 1) {
    return data[`${prefix}${closestKnownTemperature}`];
  }

  return null;
}

module.exports = {
  extractMaybeTemperatureStrings,
  extractFloats,
  hasGranularTemperatures,
  lookup,
}
