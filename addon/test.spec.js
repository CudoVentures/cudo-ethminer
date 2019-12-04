const index = require('./')
const assert = require('assert')
const { describe, it } = require('mocha')

const exampleLogs = [
  {
    should: 'parse Mh hash rate messages',
    message: ' m 22:04:24 <unknown> 0:00 A1 27.37 Mh - cl0 27.37',
    expected: { type: 'hashRate', hashRate: 27370000 }
  },
  {
    should: 'parse Kh hash rate messages',
    message: ' m 22:04:24 <unknown> 0:00 A1 251.1 Kh - cl0 27.37',
    expected: { type: 'hashRate', hashRate: 251100 }
  },
  {
    should: 'parse hash rate messages',
    message: ' m 22:04:24 <unknown> 0:00 A1 27.37 h - cl0 27.37',
    expected: { type: 'hashRate', hashRate: 27.37 }
  },
  {
    should: 'parse cuda errors',
    message: 'CUDA Error : No CUDA driver found',
    expected: { type: 'error', error: ': No CUDA driver found' }
  },
  {
    should: 'parse errors',
    message: 'Error: No usable mining devices found',
    expected: { type: 'error', error: 'No usable mining devices found' }
  },
  {
    should: 'parse log messages',
    message: 'cl 22:03:35 cl-0     Using PciId : 25:00.0 Ellesmere OpenCL 2.0 AMD-APP (2841.5) Memory : 8.00 GB',
    expected: { type: 'log', message: 'Using PciId : 25:00.0 Ellesmere OpenCL 2.0 AMD-APP (2841.5) Memory : 8.00 GB' }
  }
]

describe('logging', () => {
  exampleLogs.forEach(log => {
    it(log.should, () => {
      const module = index()
      const parsedMessage = module.parseLog(log.message)
      assert.deepStrictEqual(parsedMessage, log.expected)
    })
  })
})
