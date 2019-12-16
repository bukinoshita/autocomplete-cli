const ansi = require('ansi-escapes')
const chalk = require('chalk')

module.exports = ({
  forceLowerCase = false,
  start = '',
  suggestions = [],
  suggestionColor = 'gray'
} = {}) => {
  return new Promise((resolve, reject) => {
    const { stdout, stdin } = process
    const { isRaw } = stdin
    const abortChars = new Set(['\u0003'])
    const resolveChars = new Set(['\r'])
    const autoCompleteChars = new Set([
      '\t' /* tab */,
      '\r' /* return */,
      '\u001B[C' /* right arrow */,
      ' ' /* Spacebar */
    ])

    // Some environments (e.g., cygwin) don't provide a tty
    if (!stdin.setRawMode) {
      return reject(new TypeError('stdin lacks setRawMode support'))
    }

    stdout.write(start)
    stdin.setRawMode(true)
    stdin.resume()

    const restore = () => {
      stdout.write('')
      stdin.setRawMode(isRaw)
      stdin.pause()
      stdin.removeListener('data', onData)
    }

    let val = ''
    let suggestion = ''
    let caretOffset = 0

    // To make `for..of` work with buble
    const _suggestions = [...suggestions]

    const onData = buffer => {
      const data = buffer.toString()

      // Abort upon ctrl+C
      if (abortChars.has(data)) {
        restore()
        return reject(new TypeError('User abort'))
      }

      let completion = ''

      // If we have a suggestion *and*
      // the user is at the end of the line *and*
      // the user pressed one of the keys to trigger completion
      if (suggestion !== '' && !caretOffset && autoCompleteChars.has(data)) {
        val += suggestion
        suggestion = ''
      } else {
        if (data === '\u001B[D') {
          if (val.length > Math.abs(caretOffset)) {
            caretOffset--
          }
        } else if (data === '\u001B[C') {
          if (caretOffset < 0) {
            caretOffset++
          }
        } else if (data === '\u0008' || data === '\u007F') {
          // Delete key needs splicing according to caret position
          val = val.slice(0, val.length + caretOffset - 1) + val.slice(val.length + caretOffset)
        } else {
          if (resolveChars.has(data)) {
            restore()
            return resolve(val)
          }

          const add = forceLowerCase ? data.toLowerCase() : data
          val = val.slice(0, val.length + caretOffset) + add + val.slice(val.length + caretOffset)
        }

        if (val.length > 0) {
          for (const sugestion of _suggestions) {
            if (val === sugestion) {
              break
            }

            if (val === sugestion.slice(0, val.length)) {
              suggestion = sugestion.slice(val.length)
              completion = chalk[suggestionColor](suggestion)
              completion += ansi.cursorBackward(sugestion.length - val.length)
              break
            }
          }
        }

        if (completion.length < 0) {
          suggestion = ''
        }
      }

      stdout.write(ansi.eraseLines(1) + start + val + completion)
      if (caretOffset) {
        stdout.write(ansi.cursorBackward(Math.abs(caretOffset)))
      }
    }

    stdin.on('data', onData)
  })
}
