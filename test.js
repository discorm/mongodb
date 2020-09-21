'use strict'

const { MongoClient, ObjectId } = require('mongodb')
const tap = require('tap')

const disco = require('@disco/disco')
const { BaseModel } = require('@disco/base-driver')

const driver = require('./')

const options = {
  useUnifiedTopology: true
}

tap.test('mongodb driver', async t => {
  const client = await MongoClient.connect('mongodb://localhost/test', options)
  const db = client.db('test')
  await db.dropDatabase()

  const modeller = disco(driver(client))

  modeller.use(function monitorHooks () {
    this.driver = class extends this.driver {
      static async reset (data = []) {
        this.hooks = []
        const collection = await this.collection
        await collection.removeMany({})
        if (data.length) {
          const result = await collection.insertMany(data)
          return result.ops.map(doc => this.build(doc))
        }
      }

      emit (event) {
        this.constructor.hooks.push(event)
      }
    }
  })

  const Model = modeller.createModel('model')

  t.teardown(() => client.close())

  t.test('construct from url', async t => {
    const Base = await driver('mongodb://localhost/test', options)
    const modeller = disco(Base)
    const Model = modeller.createModel('test')
    t.equal((await Model.collection).collectionName, 'test')
    t.ok(new Model() instanceof BaseModel)
    await Model.client.close()
  })

  t.test('construct from client', async t => {
    const Base = driver(client)
    const modeller = disco(Base)
    const Model = modeller.createModel('test')
    t.equal((await Model.collection).collectionName, 'test')
    t.ok(new Model() instanceof BaseModel)
  })

  t.test('construct from database', async t => {
    const Base = driver(db)
    const modeller = disco(Base)
    const Model = modeller.createModel('test')
    t.equal((await Model.collection).collectionName, 'test')
    t.ok(new Model() instanceof BaseModel)
  })

  t.test('count', async t => {
    await Model.reset([
      { test: 'count' }
    ])
    t.equal(await Model.count(), 1)
    t.equal(await Model.count({ _id: ObjectId().toString() }), 0)
    t.deepEqual(Model.hooks, [])
  })

  t.test('build', async t => {
    await Model.reset()
    const model = await Model.build({ test: 'build' })
    t.ok(model.isNew)
    t.deepEqual(await Model.find(), [])
    t.deepEqual(Model.hooks, [])
  })

  t.test('create', async t => {
    await Model.reset()
    const model = await Model.create({ test: 'create' })
    t.notOk(model.isNew)
    const found = await Model.find()
    t.equal(found.length, 1)
    t.equal(found[0].test, 'create')
    t.deepEqual(Model.hooks, [
      'validate',
      'beforeCreate',
      'beforeSave',
      'afterSave',
      'afterCreate'
    ])
  })

  //
  // Find
  //
  t.test('findOrCreate', async t => {
    t.comment('when absent')
    {
      await Model.reset()
      const model = await Model.findOrCreate({ test: 'findOrCreate when absent' })
      t.notOk(model.isNew)
      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].test, 'findOrCreate when absent')
      t.deepEqual(Model.hooks, [
        'validate',
        'beforeCreate',
        'beforeSave',
        'afterSave',
        'afterCreate'
      ])
    }

    t.comment('when present')
    {
      await Model.reset([
        { test: 'findOrCreate when present' }
      ])
      const model = await Model.findOrCreate({ test: 'findOrCreate when present' })
      t.notOk(model.isNew)
      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].test, 'findOrCreate when present')
      t.deepEqual(Model.hooks, [])
    }
  })

  t.test('findOne', async t => {
    await Model.reset([
      { test: 'findOne' }
    ])
    const model = await Model.findOne({ test: 'findOne' })
    t.notOk(model.isNew)
    const found = await Model.find()
    t.equal(found.length, 1)
    t.equal(found[0].test, 'findOne')
    t.deepEqual(Model.hooks, [])
  })

  t.test('findById', async t => {
    const docs = await Model.reset([
      { test: 'findById' }
    ])

    const model = await Model.findById(docs[0]._id)
    t.ok(model)
    t.notOk(model.isNew)

    const found = await Model.find()
    t.equal(found.length, 1)
    t.equal(found[0].test, 'findById')
    t.deepEqual(Model.hooks, [
      // TODO: Figure out how to include these hooks
      // 'beforeFetch',
      // 'afterFetch'
    ])
  })

  t.test('find', async t => {
    await Model.reset([
      { test: 'find' },
      { test: 'find' }
    ])

    const models = await Model.find({ test: 'find' })

    for (const model of models) {
      t.equal(model.test, 'find')
    }

    const empty = await Model.find({ test: 'doesNotExist' })
    t.notOk(empty.length, 'should not find non-matching models')

    const found = await Model.find()
    t.equal(found.length, 2)
    t.equal(found[0].test, 'find')
    t.equal(found[1].test, 'find')
    t.deepEqual(Model.hooks, [])
  })

  t.test('findIterator', async t => {
    await Model.reset([
      { test: 'findIterator' },
      { test: 'findIterator' }
    ])

    for await (const model of Model.findIterator({ test: 'findIterator' })) {
      t.equal(model.test, 'findIterator')
    }

    const it = Model.findIterator({ test: 'doesNotExist' })
    t.ok((await it.next()).done, 'should not find non-matching models')

    const found = await Model.find()
    t.equal(found.length, 2)
    t.equal(found[0].test, 'findIterator')
    t.equal(found[1].test, 'findIterator')
    t.deepEqual(Model.hooks, [])
  })

  //
  // Update
  //
  t.test('createOrUpdate', async t => {
    t.comment('when absent')
    {
      await Model.reset()
      await Model.createOrUpdate({ test: 'createOrUpdate when absent' }, { foo: 'bar' })
      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].test, 'createOrUpdate when absent')
      t.equal(found[0].foo, 'bar')
      t.deepEqual(Model.hooks, [
        'validate',
        'beforeCreate',
        'beforeSave',
        'afterSave',
        'afterCreate'
      ])
    }

    t.comment('when present')
    {
      await Model.reset([
        { test: 'createOrUpdate when present' }
      ])
      await Model.createOrUpdate({ test: 'createOrUpdate when present' }, { foo: 'bar' })
      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].test, 'createOrUpdate when present')
      t.equal(found[0].foo, 'bar')
      t.deepEqual(Model.hooks, [
        'validate',
        'beforeUpdate',
        'beforeSave',
        'afterSave',
        'afterUpdate'
      ])
    }
  })

  t.test('updateOne', async t => {
    await Model.reset([
      { test: 'updateOne' }
    ])

    const model = await Model.updateOne({ test: 'updateOne' }, { foo: 'bar' })
    t.equal(model.test, 'updateOne')
    t.equal(model.foo, 'bar')

    const found = await Model.find()
    t.equal(found.length, 1)
    t.equal(found[0].test, 'updateOne')
    t.equal(found[0].foo, 'bar')
    t.deepEqual(Model.hooks, [
      'validate',
      'beforeUpdate',
      'beforeSave',
      'afterSave',
      'afterUpdate'
    ])
  })

  t.test('updateById', async t => {
    const data = [
      { test: 'updateById' },
      { test: 'updateById' },
      { test: 'updateById' }
    ]

    const docs = await Model.reset(data)

    await t.rejects(Model.updateById(new ObjectId(), { baz: 'buz' }), /Record not found/)
    // TODO: Should pronbably trigger this?
    // t.deepEqual(Model.hooks, ['beforeFetch'])
    await Model.reset(data)

    const model = await Model.updateById(docs[1].id, { foo: 'bar' })
    t.equal(model.test, 'updateById')
    t.equal(model.foo, 'bar')

    const found = await Model.find()
    t.equal(found.length, 3)
    for (const model of found) {
      t.equal(model.test, 'updateById')
      if (model.id.toString() === docs[1].id.toString()) {
        t.equal(model.foo, 'bar')
      } else {
        t.notOk(model.foo)
      }
    }
    t.deepEqual(Model.hooks, [
      'validate',
      'beforeUpdate',
      'beforeSave',
      'afterSave',
      'afterUpdate'
    ])
  })

  t.test('update', async t => {
    await Model.reset([
      { test: 'update' },
      { test: 'update' }
    ])

    const models = await Model.update({ test: 'update' }, { foo: 'bar' })

    for (const model of models) {
      t.equal(model.test, 'update')
      t.equal(model.foo, 'bar')
    }

    const empty = await Model.update({ test: 'doesNotExist' }, { baz: 'buz' })
    t.notOk(empty.length, 'should not update non-matching models')

    const found = await Model.find()
    t.equal(found.length, 2)
    t.equal(found[0].test, 'update')
    t.equal(found[0].foo, 'bar')
    t.equal(found[1].test, 'update')
    t.equal(found[1].foo, 'bar')
    t.deepEqual(Model.hooks, [
      'validate',
      'beforeUpdate',
      'beforeSave',
      'afterSave',
      'afterUpdate',
      'validate',
      'beforeUpdate',
      'beforeSave',
      'afterSave',
      'afterUpdate'
    ])
  })

  t.test('updateIterator', async t => {
    await Model.reset([
      { test: 'updateIterator' },
      { test: 'updateIterator' }
    ])

    for await (const model of Model.updateIterator({ test: 'updateIterator' }, { foo: 'bar' })) {
      t.equal(model.test, 'updateIterator')
      t.equal(model.foo, 'bar')
    }

    const it = Model.updateIterator({ test: 'doesNotExist' }, { baz: 'buz' })
    t.ok((await it.next()).done, 'should not update non-matching models')

    const found = await Model.find()
    t.equal(found.length, 2)
    t.equal(found[0].test, 'updateIterator')
    t.equal(found[0].foo, 'bar')
    t.equal(found[1].test, 'updateIterator')
    t.equal(found[1].foo, 'bar')
    t.deepEqual(Model.hooks, [
      'validate',
      'beforeUpdate',
      'beforeSave',
      'afterSave',
      'afterUpdate',
      'validate',
      'beforeUpdate',
      'beforeSave',
      'afterSave',
      'afterUpdate'
    ])
  })

  //
  // Remove
  //
  t.test('removeOne', async t => {
    await Model.reset([
      { test: 'removeOne' }
    ])

    const model = await Model.removeOne({ test: 'removeOne' })
    t.ok(model.isNew)

    t.deepEqual(await Model.find(), [])
    t.deepEqual(Model.hooks, [
      'beforeRemove',
      'afterRemove'
    ])
  })

  t.test('removeById', async t => {
    const data = [
      { test: 'removeById' },
      { test: 'removeById' },
      { test: 'removeById' }
    ]
    const docs = await Model.reset(data)

    await t.rejects(Model.removeById(new ObjectId()), /^Record not found$/)
    // TODO: This should probably emit events
    // t.deepEqual(Model.hooks, ['beforeRemove'])
    await Model.reset(data)

    const model = await Model.removeById(docs[1]._id)
    t.ok(model.isNew)

    t.deepEqual(await Model.find(), [
      docs[0],
      docs[2]
    ])
    t.deepEqual(Model.hooks, [
      'beforeRemove',
      'afterRemove'
    ])
  })

  t.test('remove', async t => {
    await Model.reset([
      { test: 'remove' },
      { test: 'remove' }
    ])

    const empty = await Model.remove({ test: 'doesNotExist' })
    t.notOk(empty.length, 'should not remove non-matching models')

    const models = await Model.remove({ test: 'remove' })
    for (const model of models) {
      t.equal(model.test, 'remove')
    }

    t.deepEqual(await Model.find(), [])
    t.deepEqual(Model.hooks, [
      'beforeRemove',
      'afterRemove',
      'beforeRemove',
      'afterRemove'
    ])
  })

  t.test('removeIterator', async t => {
    await Model.reset([
      { test: 'removeIterator' },
      { test: 'removeIterator' }
    ])

    const it = Model.removeIterator({ test: 'doesNotExist' })
    t.ok((await it.next()).done, 'should not remove non-matching models')

    for await (const model of Model.removeIterator({ test: 'removeIterator' })) {
      t.ok(model.isNew)
      t.equal(model.test, 'removeIterator')
    }

    t.deepEqual(await Model.find(), [])
    t.deepEqual(Model.hooks, [
      'beforeRemove',
      'afterRemove',
      'beforeRemove',
      'afterRemove'
    ])
  })

  //
  // Methods
  //
  t.test('methods', t => {
    const model = new Model({ name: 'a' })

    t.test('isNew', t => {
      t.ok(model.isNew)
      t.end()
    })

    t.test('toJSON', t => {
      t.deepEqual(model.toJSON(), {
        name: 'a'
      })
      t.end()
    })

    t.test('save unsaved model', async t => {
      await Model.reset()
      await model.save()
      t.notOk(model.isNew)
      t.deepEqual(model, { name: 'a' }, 'does not modify model')

      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].name, 'a')

      t.deepEqual(Model.hooks, [
        'validate',
        'beforeCreate',
        'beforeSave',
        'afterSave',
        'afterCreate'
      ])
      t.end()
    })

    t.test('save already saved model', async t => {
      Model.hooks = []

      model.name = 'b'
      await model.save()
      t.deepEqual(model, { name: 'b' }, 'does not modify model')

      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].name, 'b')

      t.deepEqual(Model.hooks, [
        'validate',
        'beforeUpdate',
        'beforeSave',
        'afterSave',
        'afterUpdate'
      ])
    })

    t.test('set', async t => {
      Model.hooks = []
      const { id } = model
      model.set({ _id: id.toString(), name: 'c' })
      t.deepEqual(model, { name: 'c' }, 'modifies model')
      const found = await Model.find()
      t.ok(found[0].id.equals(id))
      t.equal(found.length, 1)
      t.equal(found[0].name, 'b')
      t.deepEqual(Model.hooks, [])
      t.end()
    })

    t.test('fetch without id', async t => {
      Model.hooks = []
      const empty = new Model({})
      await t.rejects(empty.fetch(), /Can not fetch unsaved model/)
      t.deepEqual(empty, {}, 'does not modify model')
      t.deepEqual(Model.hooks, [])
      t.end()
    })

    t.test('fetch with id', async t => {
      Model.hooks = []
      await model.fetch()
      t.deepEqual(model, { name: 'b' }, 'modifies model')
      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].name, 'b')
      t.deepEqual(Model.hooks, [
        'beforeFetch',
        'afterFetch'
      ], 'has before and after fetch hooks on success')
    })

    t.test('update unsaved model', async t => {
      Model.hooks = []
      const empty = new Model({})
      await t.rejects(empty.update(), /Can not update unsaved model/)
      t.ok(empty.isNew)
      t.notOk(empty.id)
      t.deepEqual(empty, {}, 'does not modify model')
      t.deepEqual(Model.hooks, [])
    })

    t.test('update already saved model', async t => {
      Model.hooks = []
      await model.update({ name: 'd' })
      t.deepEqual(model, { name: 'd' }, 'modifies model')
      const found = await Model.find()
      t.equal(found.length, 1)
      t.equal(found[0].name, 'd')
      t.deepEqual(Model.hooks, [
        'validate',
        'beforeUpdate',
        'beforeSave',
        'afterSave',
        'afterUpdate'
      ])
    })

    t.test('remove unsaved model', async t => {
      Model.hooks = []
      const empty = new Model({})
      await t.rejects(empty.remove(), /Can not remove unsaved model/)
      t.deepEqual(Model.hooks, [])
    })

    t.test('remove model with invalid id', async t => {
      Model.hooks = []
      const empty = new Model({ _id: new ObjectId() })
      await t.rejects(empty.remove(), /^Failed to remove record "\w+"$/)
      t.deepEqual(Model.hooks, ['beforeRemove'])
    })

    t.test('remove already saved model', async t => {
      Model.hooks = []
      await model.remove()
      t.deepEqual(model, { name: 'd', id: undefined }, 'removes id')
      t.deepEqual(await Model.find(), [], 'persists')
      t.deepEqual(Model.hooks, [
        'beforeRemove',
        'afterRemove'
      ])
    })

    t.end()
  })
})
