# @disco/mongodb

[![CI status](https://github.com/discorm/mongodb/workflows/ci/badge.svg)](https://github.com/discorm/mongodb/actions?query=workflow%3Aci+branch%3Amaster)
[![Coverage Status](https://coveralls.io/repos/discorm/mongodb/badge.png)](https://coveralls.io/r/discorm/mongodb)
[![npm package](https://img.shields.io/npm/v/@disco/mongodb)](https://npmjs.com/package/@disco/mongodb)
[![Dependencies](https://img.shields.io/david/discorm/mongodb)](https://david-dm.org/discorm/mongodb)
[![MIT License](https://img.shields.io/npm/l/@disco/mongodb)](./LICENSE)

MongoDB driver for [disco](http://npmjs.org/package/@disco/disco).

## Usage

```js
const disco = require('@disco/disco')
const mongodb = require('@disco/mongodb')

const builder = disco(mongodb('mongodb://localhost/database'))

const Model = builder.createModel('user', {
  name: String
})

const user = await User.create({
  email: 'me@example.com'
})
```
