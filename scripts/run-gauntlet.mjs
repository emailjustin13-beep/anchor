#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  createFixtureProvider,
  createLiveProvider,
  loadGauntletCases,
  runGauntlet,
} from '../gauntlet/harness.mjs'

function option(name, fallback = '') {
  const exact = process.argv.find(argument => argument.startsWith(`--${name}=`))
  if (exact) return exact.slice(name.length + 3)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const mode = option('mode', 'fixture')
const repeatValue = Number(option('repeat', '1'))
const repeats = Number.isInteger(repeatValue) && repeatValue > 0 && repeatValue <= 10 ? repeatValue : 1
const caseFilter = option('case')
const reportPath = option('report')
const quiet = process.argv.includes('--quiet')

let cases = await loadGauntletCases()
if (caseFilter) cases = cases.filter(testCase => testCase.id === caseFilter)
if (!cases.length) throw new Error(`No Gauntlet case matched "${caseFilter}".`)

const provider = mode === 'live' ? createLiveProvider() : createFixtureProvider()
const report = await runGauntlet({ cases, provider, repeats, quiet })

if (reportPath) {
  const absolute = resolve(reportPath)
  await mkdir(dirname(absolute), { recursive:true })
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (!quiet) console.log(`Report: ${absolute}`)
}

console.log(`Gauntlet ${report.summary.passed ? 'passed' : 'failed'}: ${report.summary.checks - report.summary.failedChecks}/${report.summary.checks} checks, ${report.summary.providerCalls} provider calls, ${report.summary.cacheHits} cache hits.`)
if (!report.summary.passed) process.exitCode = 1
