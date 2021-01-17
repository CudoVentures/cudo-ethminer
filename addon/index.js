const { spawn } = require('child_process')
const EventEmitter = require('events')
const fs = require('fs')
const path = require('path')

const NEWLINE_SEPERATOR = /[\r]{0,1}\n/
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

module.exports = () => {
  const module = new EventEmitter()
  module.isRunning = false
  module.proc = null

  module.parseLog = message => {
    const parts = message.toLowerCase().split(' ').filter(o => o)
    const log = message.split(' ').slice(4).join(' ').trim()

    if (parts[0] === 'm' && parts[5] && parts[6]) {
      let hashRate = parseFloat(parts[5] || 0) || 0
      if (parts[6].includes('gh')) {
        hashRate *= 1000000000
      } else if (parts[6].includes('mh')) {
        hashRate *= 1000000
      } else if (parts[6].includes('kh')) {
        hashRate *= 1000
      }
      return { type: 'hashRate', hashRate }
    } else if (parts[0] && parts[0].includes('error')) {
      const error = message.split(' ').slice(1).join(' ').trim()
      return { type: 'error', error }
    } else if (parts[1] && parts[1].includes('error')) {
      const error = message.split(' ').slice(2).join(' ').trim()
      return { type: 'error', error }
    }

    return { type: 'log', message: log }
  }

  module.logBuffer = ''
  module.readLog = data => {
    module.logBuffer += data.toString()
    const split = module.logBuffer.split(NEWLINE_SEPERATOR)
    split.forEach(o => {
      const log = module.parseLog(o.replace(ANSI_REGEX, ''))
      module.emit('log', log)
    })
    module.logBuffer = split[split.length - 1]
  }

  module.start = (ctx, env) => {
    module.isRunning = true
    if (module.proc) {
      return
    }

    let executable
    if (ctx.workload.platform === 'win') {
      executable = path.resolve(ctx.workloadDir, 'ethminer.exe')
      env.PATH = `${env.PATH};${ctx.workloadDir}`
    } else if (ctx.workload.platform === 'linux') {
      executable = path.resolve(ctx.workloadDir, 'ethminer')
      env.LD_LIBRARY_PATH = `$LD_LIBRARY_PATH:${ctx.workloadDir}`
    }

    const params = [
      '-P', `stratum1+tcp://${ctx.poolUser.replace(/\:/g, '-')}@${ctx.workload.host}:${ctx.workload.port}`
    ]

    if (ctx.workload.architecture === 'nvidia') {
      params.push('-U')

      if (typeof ctx.workloadSettings['devices'] === 'string') {
        params.push('--cu-devices', ctx.workloadSettings['devices'].replace(/\,/g, ' '))
      }
    } else if (ctx.workload.architecture === 'amd') {
      params.push('-G')

      if (typeof ctx.workloadSettings['devices'] === 'string') {
        params.push('--cl-devices', ctx.workloadSettings['devices'].replace(/\,/g, ' '))
      }
    }

    if (ctx.workloadSettings['cl-global-work-size-multiplier'] !== undefined) {
      params.push('--cl-global-work', ctx.workloadSettings['cl-global-work-size-multiplier'])
    }
    if (ctx.workloadSettings['cl-local-work-size'] !== undefined) {
      params.push('--cl-local-work', ctx.workloadSettings['cl-local-work-size'])
    }

    if (ctx.workloadSettings['cuda-grid-size'] !== undefined) {
      params.push('--cuda-grid-size', ctx.workloadSettings['cuda-grid-size'])
    }
    if (ctx.workloadSettings['cuda-block-size'] !== undefined) {
      params.push('--cuda-block-size', ctx.workloadSettings['cuda-block-size'])
    }
    if (ctx.workloadSettings['cuda-hashes-per-kernel'] !== undefined) {
      params.push('--cuda-parallel-hash', ctx.workloadSettings['cuda-hashes-per-kernel'])
    }
    if (ctx.workloadSettings['cuda-schedule'] !== undefined) {
      params.push('--cuda-schedule', ctx.workloadSettings['cuda-schedule'])
    }
    if (ctx.workloadSettings['cuda-streams'] !== undefined) {
      params.push('--cuda-streams', ctx.workloadSettings['cuda-streams'])
    }

    try {
      fs.accessSync(executable, fs.constants.R_OK)
      module.proc = spawn(executable, params, {
        env,
        windowsHide: true
      })
    } catch (err) {
      module.emit('error', err.toString())
      module.emit('exit')
      return
    }

    // Pass through and console output or errors to event emitter
    module.proc.stdout.on('data', data => module.readLog(data))
    module.proc.stderr.on('data', data => module.readLog(data))

    // Update state when kill has completed and restart if it has already been triggered
    module.proc.on('exit', code => {
      if (code) {
        module.isRunning = false
      } else if (module.isRunning) {
        module.start()
      }

      module.proc = null
      module.emit('exit', code)
    })

    module.proc.on('error', err => {
      module.emit('error', err)
    })

    module.emit('start', params)
  }

  module.stop = signal => {
    module.isRunning = false

    // Start killing child process
    if (module.proc) {
      module.proc.kill(signal)
    }
  }

  // Ensure miner is stopped once process closes
  process.on('exit', () => {
    if (module.proc) {
      module.proc.kill()
    }
  })

  return module
}
