module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/integration/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
