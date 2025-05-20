declare module 'primes-and-factors' {
  function isPrime(number: number): boolean
  function getFactors(number: number): number[]
  function getUniqueFactors(number: number): number[]
  function getPrimeExponentObject(number: number): { [prime: number]: number }
  function getFrequency(number: number): { factor: number; times: number }[]
}
