# meteor-mongo-files

## Introduction

A Meteor library to make file uploading and managing as easy as possible. It offers a consistent and resilient file storage strategy, relying on [busboy](https://www.npmjs.com/package/busboy), [mongodb](https://www.mongodb.com/) and [gridFS](https://www.mongodb.com/docs/manual/core/gridfs/). The files are stored in MongoDB. The package is very lightweight (~25kB minified) and has only busboy as direct dependency.

### What problem does it aim to solve ?

Keeping consistency in a file management system is not an easy task. Why not **integrate the files directly with the rest of the data** ?
Considering the Meteor ecosystem, there is currently only one well-maintained library for online file storage and management : [Meteor-files](https://github.com/veliovgroup/Meteor-Files). I have used it for different projects and I must say that it works like a charm. Meteor-Mongo-Files is not intended to replace it but to meet different needs. The main goal is to **reduce complexity to a minimum**. By focusing exclusively on MongoDB, one sacrifices the flexibility that a library such as Meteor-Files can offer, but with the advantage of providing an equally **powerful set of features** and **no boilerplate**.

### Benefits

- keep all your data in one place
- is capable of incredible scaling
- If your application is on the same network as your database, latency will be lower than with a remote storage solution like AWS S3.
- It will lower data transfer costs if you use a self-managed MongoDB instance.

### Drawbacks

- It will increase overall costs if you use a managed DBaaS like Atlas.)
- If you deal with a lot of big files, it will not perform as well as object storage.

### One library : 2 strategies

Files can either be stored in their entirety (as MongoDB documents) or chunked by GridFS. In this second case, GridFS creates 2 collections: "collection.files" and "collection.chunks", which makes it possible to reconstitute the files.
Let's evaluate which approach is better for your use case. Using one document per file seems simpler, but it also has a few disadvantages:

- a MongoDB document is limited to 16Mb
- if you store a file directly as a document, it cannot be streamed directly to the database. Hence the file will be temporarily loaded entirely into the memory which may lead to a decrease in overall performance.

So this approach is generally preferred if you have a lot of small files or if you need low latency (even if it means increasing performance costs)

And when it comes to GridFS, you can store files of unlimited size and files can be directly streamed from the DB to the client, but:

- it will use more storage because additional information is stored within each chunk
- it will need more processing power.

So this approach is generally preferred if you have fewer but larger files

## Install

```bash
npm install --save meteor-mongo-files
```

## Simple usage (CRUD)

```js
// anywhere in Meteor server

import { WebApp } from 'meteor/webapp';
import { meteorMongoFiles, Buckets } from 'meteor-mongo-files';

const [parseDocumentData, downloadDocument] = meteorMongoFiles({
  bucketName: 'documents',  // as you can see, most of the configuration is done internally.
});

WebApp.connectHandlers.use('/api/documents', async (req, res, next) => {
  switch (req.method) {
    case 'POST':
      const saveDocumentToDB = await parseDocumentData(req);
      await saveDocumentToDB(/* custom file name and metadata */); break;
    case 'GET':
      downloadDocument(req, res); break;
    case 'PATCH':
      Buckets.documents.rename(req.body.id, req.body.new_name);
      res.end(204); break;
    case 'DELETE'
      Buckets.documents.delete(req.body.id);  // where "documents" is our bucket name
      res.end(204); break;
  }
});
```

As you may have noticed, for renaming and deleting we can directly rely on [GridFSBucket](https://mongodb.github.io/node-mongodb-native/4.8/classes/GridFSBucket.html).

### Options

`meteorMongoFiles(options)`
| Attribute | Type | Default value | Description
|---|---|---|---|
| BucketName | string | 'documents' | name of the bucket/collection that MeteorMongoFiles will create |
| gridFS | boolean | true | defines whether GridFS engine will be used or not |
| db | Db (MongoDB native) | default Meteor MongoDB instance | MongoDB instance|
| generateFileId | function | `Random.id()` | a function to generate a custom MongoDB \_id |

### Example of requests

```js
// POST
const formData = new FormData();
formData.append('ressource_id', data._id);
formData.append('ressource_type', 'contact');
formData.append('file', file);
formData.append('filename', file.name); // filename is sent separately because utf-8 encoding will be lost

await axios.post('/api/documents', formData);
```

GET requests are based on 2 query params: `id` and `download`

```js
// GET
const res = await axios.get(
  `/api/documents?id=${fileId}&download=false`),
);
```

If download query param is true, it will trigger a download. If not, the file will be opened in the browser (provided that its format is supported). This parameter actually determines the Content-Disposition header of the response.

```html
<!-- inline -->
<img
	src="https://yourwebsite.domain/api/documents?id=FpPJxvmN8gDnKSiqp&download=false"
/>

<!-- download -->
<a
	href="https://yourwebsite.domain/api/documents?id=FpPJxvmN8gDnKSiqp&download=true"
	>Download</a
>
```

## Take advantage of Meteor's reactivity

When you create a GridFS bucket (see the example above) it also creates 2 MongoDB collections (if GridFS is enabled) or juste one (if disabled). In the case of our previous example, 2 collections were created: "documents.files" and "documents.chunks". These collections can be used as usual within Meteor.

### GridFS enabled

```js
const Documents = new Mongo.Collection('documents.files');

Meteor.publish('documents.files', function () {
	return Documents.find({});
});
```

### GridFS disabled

With GridFS disabled, the only collection get the same name as the bucket. There is one particularity that requires our attention in this case: the MongoDB document has a field which holds all the file's data. Hence, for a reason that seems fairly obvious, the **"data" field <u>must</u> be excluded from our publication**.

```js
const Documents = new Mongo.Collection('documents');

Meteor.publish('documents', function () {
	return Documents.find({}, { fields: { data: 0 } });
});
```

## The whole picture (GridFS enabled)

![GridFSUpload](https://github.com/jonisapp/meteor-mongo-files/blob/main/documentation/GridFSFileUpload.png)

## License

MIT © [jonisapp](https://github.com/jonisapp)
