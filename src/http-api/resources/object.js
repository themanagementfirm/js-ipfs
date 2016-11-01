'use strict'

const bs58 = require('bs58')
const multipart = require('ipfs-multipart')
const dagPB = require('ipld-dag-pb')
const DAGLink = dagPB.DAGLink
const DAGNode = dagPB.DAGNode
const debug = require('debug')
const log = debug('http-api:object')
log.error = debug('http-api:object:error')

exports = module.exports

// common pre request handler that parses the args and returns `key` which is assigned to `request.pre.args`
exports.parseKey = (request, reply) => {
  if (!request.query.arg) {
    return reply("Argument 'key' is required").code(400).takeover()
  }

  try {
    return reply({
      key: new Buffer(bs58.decode(request.query.arg))
    })
  } catch (err) {
    log.error(err)
    return reply({
      Message: 'invalid ipfs ref path',
      Code: 0
    }).code(500).takeover()
  }
}

exports.new = (request, reply) => {
  request.server.app.ipfs.object.new((err, node) => {
    if (err) {
      log.error(err)
      return reply({
        Message: `Failed to create object: ${err.message}`,
        Code: 0
      }).code(500)
    }

    node.toJSON((err, nodeJSON) => {
      if (err) {
        return reply({
          Message: 'Failed to get object: ' + err,
          Code: 0
        }).code(500)
      }
      return reply(nodeJSON)
    })
  })
}

exports.get = {
  // uses common parseKey method that returns a `key`
  parseArgs: exports.parseKey,

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const key = request.pre.args.key
    const enc = request.query.enc || 'base58'

    request.server.app.ipfs.object.get(key, {enc}, (err, node) => {
      if (err) {
        log.error(err)
        return reply({
          Message: 'Failed to get object: ' + err,
          Code: 0
        }).code(500)
      }

      node.toJSON((err, nodeJSON) => {
        if (err) {
          return reply({
            Message: 'Failed to get object: ' + err,
            Code: 0
          }).code(500)
        }

        nodeJSON.Data = nodeJSON.Data ? nodeJSON.Data.toString() : ''
        return reply(nodeJSON)
      })
    })
  }
}

exports.put = {
  // pre request handler that parses the args and returns `node`
  // which is assigned to `request.pre.args`
  parseArgs: (request, reply) => {
    if (!request.payload) {
      return reply("File argument 'data' is required").code(400).takeover()
    }

    const enc = request.query.inputenc
    const parser = multipart.reqParser(request.payload)

    let file
    let finished = true

    parser.on('file', (name, stream) => {
      finished = false
      // TODO fix: stream is not emitting the 'end' event
      stream.on('data', (data) => {
        if (enc === 'protobuf') {
          dagPB.util.deserialize(data, (err, node) => {
            if (err) {
              return reply({
                Message: 'Failed to receive protobuf encoded: ' + err,
                Code: 0
              }).code(500).takeover()
            }

            node.toJSON((err, nodeJSON) => {
              if (err) {
                return reply({
                  Message: 'Failed to receive protobuf encoded: ' + err,
                  Code: 0
                }).code(500).takeover()
              }
              file = new Buffer(JSON.stringify(nodeJSON))
              finished = true
            })
          })
        } else {
          file = data

          finished = true
        }
      })
    })

    parser.on('end', finish)

    function finish () {
      if (!finished) {
        return setTimeout(finish, 10)
      }
      if (!file) {
        return reply("File argument 'data' is required").code(400).takeover()
      }

      try {
        return reply({
          node: JSON.parse(file.toString())
        })
      } catch (err) {
        return reply({
          Message: 'Failed to parse the JSON: ' + err,
          Code: 0
        }).code(500).takeover()
      }
    }
  },

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const nodeJSON = request.pre.args.node
    const node = new DAGNode(new Buffer(nodeJSON.Data), nodeJSON.Links)

    request.server.app.ipfs.object.put(node, (err, obj) => {
      if (err) {
        log.error(err)
        return reply({
          Message: 'Failed to put object: ' + err,
          Code: 0
        }).code(500)
      }

      node.toJSON((err, nodeJSON) => {
        if (err) {
          return reply({
            Message: 'Failed to put object: ' + err,
            Code: 0
          }).code(500)
        }

        return reply(nodeJSON)
      })
    })
  }
}

exports.stat = {
  // uses common parseKey method that returns a `key`
  parseArgs: exports.parseKey,

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const key = request.pre.args.key

    request.server.app.ipfs.object.stat(key, (err, stats) => {
      if (err) {
        log.error(err)
        return reply({
          Message: 'Failed to get object: ' + err,
          Code: 0
        }).code(500)
      }

      return reply(stats)
    })
  }
}

exports.data = {
  // uses common parseKey method that returns a `key`
  parseArgs: exports.parseKey,

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const key = request.pre.args.key

    request.server.app.ipfs.object.data(key, (err, data) => {
      if (err) {
        log.error(err)
        return reply({
          Message: 'Failed to get object: ' + err,
          Code: 0
        }).code(500)
      }

      return reply(data)
    })
  }
}

exports.links = {
  // uses common parseKey method that returns a `key`
  parseArgs: exports.parseKey,

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const key = request.pre.args.key

    request.server.app.ipfs.object.get(key, (err, node) => {
      if (err) {
        log.error(err)
        return reply({
          Message: 'Failed to get object: ' + err,
          Code: 0
        }).code(500)
      }

      node.toJSON((err, nodeJSON) => {
        if (err) {
          return reply({
            Message: 'Failed to get object: ' + err,
            Code: 0
          }).code(500)
        }
        return reply({
          Hash: nodeJSON.Hash,
          Links: nodeJSON.Links
        })
      })
    })
  }
}

// common pre request handler that parses the args and returns `data` & `key` which are assigned to `request.pre.args`
exports.parseKeyAndData = (request, reply) => {
  if (!request.query.arg) {
    return reply("Argument 'root' is required").code(400).takeover()
  }

  if (!request.payload) {
    return reply("File argument 'data' is required").code(400).takeover()
  }

  const parser = multipart.reqParser(request.payload)
  let file

  parser.on('file', (fileName, fileStream) => {
    fileStream.on('data', (data) => {
      file = data
    })
  })

  parser.on('end', () => {
    if (!file) {
      return reply("File argument 'data' is required").code(400).takeover()
    }

    try {
      return reply({
        data: file,
        key: new Buffer(bs58.decode(request.query.arg))
        // TODO: support ipfs paths: https://github.com/ipfs/http-api-spec/pull/68/files#diff-2625016b50d68d922257f74801cac29cR3880
      })
    } catch (err) {
      return reply({
        Message: 'invalid ipfs ref path',
        Code: 0
      }).code(500).takeover()
    }
  })
}

exports.patchAppendData = {
  // uses common parseKeyAndData method that returns a `data` & `key`
  parseArgs: exports.parseKeyAndData,

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const key = request.pre.args.key
    const data = request.pre.args.data

    request.server.app.ipfs.object.patch.appendData(key, data, (err, node) => {
      if (err) {
        log.error(err)

        return reply({
          Message: 'Failed to apend data to object: ' + err,
          Code: 0
        }).code(500)
      }

      node.toJSON((err, nodeJSON) => {
        if (err) {
          return reply({
            Message: 'Failed to get object: ' + err,
            Code: 0
          }).code(500)
        }
        return reply(nodeJSON)
      })
    })
  }
}

exports.patchSetData = {
  // uses common parseKeyAndData method that returns a `data` & `key`
  parseArgs: exports.parseKeyAndData,

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const key = request.pre.args.key
    const data = request.pre.args.data

    request.server.app.ipfs.object.patch.setData(key, data, (err, node) => {
      if (err) {
        log.error(err)

        return reply({
          Message: 'Failed to apend data to object: ' + err,
          Code: 0
        }).code(500)
      }

      node.toJSON((err, nodeJSON) => {
        if (err) {
          return reply({
            Message: 'Failed to get object: ' + err,
            Code: 0
          }).code(500)
        }
        return reply({
          Hash: nodeJSON.Hash,
          Links: nodeJSON.Links
        })
      })
    })
  }
}

exports.patchAddLink = {
  // pre request handler that parses the args and returns `root`, `name` & `ref` which is assigned to `request.pre.args`
  parseArgs: (request, reply) => {
    if (!(request.query.arg instanceof Array) || request.query.arg.length !== 3) {
      return reply("Arguments 'root', 'name' & 'ref' are required").code(400).takeover()
    }

    const error = (msg) => reply({
      Message: msg,
      Code: 0
    }).code(500).takeover()

    if (!request.query.arg[0]) {
      return error('cannot create link with no root')
    }

    if (!request.query.arg[1]) {
      return error('cannot create link with no name!')
    }

    if (!request.query.arg[2]) {
      return error('cannot create link with no ref')
    }

    try {
      return reply({
        root: new Buffer(bs58.decode(request.query.arg[0])),
        name: request.query.arg[1],
        ref: new Buffer(bs58.decode(request.query.arg[2]))
      })
    } catch (err) {
      log.error(err)
      return error('invalid ipfs ref path')
    }
  },

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const root = request.pre.args.root
    const name = request.pre.args.name
    const ref = request.pre.args.ref

    request.server.app.ipfs.object.get(ref, (err, linkedObj) => {
      if (err) {
        log.error(err)
        return reply({
          Message: 'Failed to get linked object: ' + err,
          Code: 0
        }).code(500)
      }

      linkedObj.size((err, size) => {
        if (err) {
          return reply({
            Message: 'Failed to get linked object: ' + err,
            Code: 0
          }).code(500)
        }
        linkedObj.multihash((err, multihash) => {
          if (err) {
            return reply({
              Message: 'Failed to get linked object: ' + err,
              Code: 0
            }).code(500)
          }

          const link = new DAGLink(name, size, multihash)

          request.server.app.ipfs.object.patch.addLink(root, link, (err, node) => {
            if (err) {
              log.error(err)

              return reply({
                Message: 'Failed to add link to object: ' + err,
                Code: 0
              }).code(500)
            }

            node.toJSON(gotJSON)

            function gotJSON (err, nodeJSON) {
              if (err) {
                return reply({
                  Message: 'Failed to get object: ' + err,
                  Code: 0
                }).code(500)
              }
              return reply(nodeJSON)
            }
          })
        })
      })
    })
  }
}

exports.patchRmLink = {
  // pre request handler that parses the args and returns `root` & `link` which is assigned to `request.pre.args`
  parseArgs: (request, reply) => {
    if (!(request.query.arg instanceof Array) || request.query.arg.length !== 2) {
      return reply("Arguments 'root' & 'link' are required").code(400).takeover()
    }

    if (!request.query.arg[1]) {
      return reply({
        Message: 'cannot create link with no name!',
        Code: 0
      }).code(500).takeover()
    }

    try {
      return reply({
        root: new Buffer(bs58.decode(request.query.arg[0])),
        link: request.query.arg[1]
      })
    } catch (err) {
      log.error(err)
      return reply({
        Message: 'invalid ipfs ref path',
        Code: 0
      }).code(500).takeover()
    }
  },

  // main route handler which is called after the above `parseArgs`, but only if the args were valid
  handler: (request, reply) => {
    const root = request.pre.args.root
    const link = request.pre.args.link

    request.server.app.ipfs.object.patch.rmLink(root, link, (err, node) => {
      if (err) {
        log.error(err)
        return reply({
          Message: 'Failed to add link to object: ' + err,
          Code: 0
        }).code(500)
      }

      node.toJSON((err, nodeJSON) => {
        if (err) {
          return reply({
            Message: 'Failed to get object: ' + err,
            Code: 0
          }).code(500)
        }
        return reply(nodeJSON)
      })
    })
  }
}
