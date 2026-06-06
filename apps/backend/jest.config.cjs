module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testPathIgnorePatterns: ['<rootDir>/tests/integration/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
