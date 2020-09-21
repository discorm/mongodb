'use strict'

const { BaseModel } = require('@disco/base-driver')

const { Db, MongoClient, ObjectId } = require('mongodb')

function fixId (obj) {
  if (obj) {
    if (!obj._id && obj.id) {
      obj._id = obj.id
    }
    delete obj.id

    if (typeof obj._id === 'string') {
      obj._id = new ObjectId(obj._id)
    }
  }

  return obj
}

function ensureObjectId (value) {
  return typeof value === 'string' ? new ObjectId(value) : value
}

function fromDatabase (db) {
  async function ensureCollection (name) {
    try {
      const cursor = await db.listCollections({ name })
      const collections = await cursor.toArray()
      if (collections.length) {
        return db.collection(collections[0].name)
      }
      return await db.createCollection(name)
    } catch (err) {}
  }

  return class MongoDatabaseModel extends BaseModel {
    get collection () {
      return this.constructor.collection
    }

    get changes () {
      const { id, ...data } = this
      return data
    }

    set (key, value) {
      if (key === '_id') {
        return this.set('id', value)
      }

      if (key === 'id') {
        Object.defineProperty(this, 'id', {
          configurable: true,
          value: ensureObjectId(value)
        })
        return
      }

      return super.set(key, value)
    }

    get idQuery () {
      return { _id: this.id }
    }

    async _fetch () {
      const coll = await this.collection
      return coll.findOne(this.idQuery)
    }

    async _save () {
      const coll = await this.collection
      const res = await coll.insertOne(this.changes)
      return {
        _id: res.insertedId,
        ...this
      }
    }

    async _update () {
      const coll = await this.collection
      const query = this.idQuery
      await coll.updateOne(query, {
        $set: this.changes
      })
      return this
    }

    async _remove () {
      const coll = await this.collection
      const res = await coll.deleteOne(this.idQuery)
      if (!res.result.n) {
        throw new Error(`Failed to remove record "${this._id}"`)
      }

      Object.defineProperty(this, 'id', {
        configurable: true,
        value: undefined
      })

      return res
    }

    static async find (query, options) {
      const coll = await this.collection
      const cursor = await coll.find(fixId(query), options)
      const docs = await cursor.toArray()
      return docs.map(doc => this.build(doc))
    }

    static async findOne (query, options) {
      const coll = await this.collection
      const doc = await coll.findOne(fixId(query), options)
      if (!doc) return
      return this.build(doc)
    }

    static async * findIterator (query, options) {
      const coll = await this.collection
      const cursor = await coll.find(fixId(query), options)
      let doc
      while ((doc = await cursor.next())) {
        yield this.build(doc)
      }
    }

    static async count (query) {
      const coll = await this.collection
      return coll.countDocuments(fixId(query))
    }

    static makeModel (name) {
      const Model = super.makeModel(name)
      define(Model, 'collection', ensureCollection(name))
      define(Model, 'db', db)
      return Model
    }
  }
}

function fromClient (client, database) {
  const Model = fromDatabase(client.db(database || 'mongodb'))

  return class MongoClientModel extends Model {
    static makeModel (name) {
      const Model = super.makeModel(name)
      define(Model, 'client', client)
      return Model
    }
  }
}

function getDatabaseFromUrl (url) {
  return (new URL(url)).pathname.slice(1)
}

async function fromUrl (url, options) {
  const client = await MongoClient.connect(url, options)
  return fromClient(client, getDatabaseFromUrl(url))
}

function mongoDriver (url, options) {
  if (url instanceof MongoClient) {
    return fromClient(url)
  }
  if (url instanceof Db) {
    return fromDatabase(url)
  }
  return fromUrl(url, options)
}

function define (target, name, value) {
  Object.defineProperty(target, name, { value })
}

module.exports = mongoDriver
mongoDriver.fromUrl = fromUrl
mongoDriver.fromClient = fromClient
mongoDriver.fromDatabase = fromDatabase
