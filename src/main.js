import busboy from 'busboy';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';

const Random = global?.Package?.['random']?.Random;

/*
	constants
*/
const TEMP_FOLDER_PATH = `${os.tmpdir()}/mongo-files-uploads`;

/*
	global variables
*/
var GridFSBucket;
var db;
var Buckets = {};

/*
	utils
*/
const createGridFSBucket = (bucketName) => {
	return new GridFSBucket(db, { bucketName });
};

const createMongoCollection = (name) => {
	return db.collection(name);
};

const makeDirIfNotExists = async (path) => {
	if (!fs.existsSync(path)) {
		await fsPromises.mkdir(path, {
			recursive: true,
		});
	}
};

const getFileOnServer = async (req, { _gridFS, bucket, generateFileId }) => {
	// id used for temp file name and mongodb _id
	const id = generateFileId();

	/*
		- stream request to server storage as temp file
		- get file infos
		- parse additional formData fields
	*/
	const [fileInformations, fields] =
		await streamRequestDataToTempFile_and_getAdditionalFields(req, id);

	/*
		update request file and body objects
	*/
	req.file = fileInformations;
	req.body = fields;

	return (userParams = {}) =>
		saveFileToDB(userParams, { req, _gridFS, bucket });
};

const streamRequestDataToTempFile_and_getAdditionalFields = async (req, id) => {
	return await new Promise((resolve, reject) => {
		const bb = busboy({ headers: req.headers });

		req.pipe(bb);

		let fileInformations = {};

		bb.on('file', async (name, fileToServer_stream, info) => {
			const tempFile_path = `${TEMP_FOLDER_PATH}/${id}`;

			fileInformations = {
				...info,
				path: tempFile_path,
			};

			const fileToTempFile_stream = fs.createWriteStream(tempFile_path);
			fileToServer_stream.pipe(fileToTempFile_stream);
			const tempFileWasWrittenToDisk = await new Promise((resolve, reject) => {
				fileToTempFile_stream.on('finish', () => {
					resolve(true);
				});
				fileToTempFile_stream.on('error', (err) => {
					reject(err);
				});
			});
		});

		const fields = {};

		bb.on('field', (name, value) => {
			fields[name] = value;
		});

		bb.on('close', () => {
			resolve([fileInformations, fields]);
		});
	});
};

const saveFileToDB = (
	{ filename = null, metadata = null },
	{ req, _gridFS, bucket }
) => {
	const id = Random.id();
	const { path, mimeType } = req.file;
	const defaultFileName = req.file.filename;

	const fileOptions = {
		id,
		contentType: mimeType,
		metadata: metadata ? metadata : req.body,
	};

	/* 
		gridFS enabled -> stream to DB through gridFS
	*/
	if (_gridFS) {
		const uploadedFile_stream = fs
			.createReadStream(path)
			.pipe(
				bucket.openUploadStream(
					filename ? filename : defaultFileName,
					fileOptions
				)
			);

		return new Promise((resolve, reject) => {
			uploadedFile_stream.on('finish', () => {
				fs.promises.unlink(path);
				resolve(id);
			});
		});

		/*
		gridFS disabled -> upload file data directly to DB collection 
	*/
	} else {
		return new Promise((resolve, reject) => {
			fs.readFile(path, (err, data) => {
				bucket
					.insertOne({
						_id: id,
						length: data.length,
						uploadDate: new Date(),
						filename: filename ? filename : defaultFileName,
						contentType: mimeType,
						metadata: metadata ? metadata : req.body,
						data,
					})
					.then(() => {
						fs.promises.unlink(path);
						resolve(id);
					})
					.catch((err) => reject(err));
			});
		});
	}
};

const downloadFile = async (req, res, { bucket }) => {
	const files_cursor = await bucket.find({ _id: req.query.id });
	const files = await files_cursor.toArray();
	const file = files[0];

	res.writeHead(200, {
		filename: file.filename,
		'Content-type': file.contentType,
		'Content-Disposition':
			req.query.download === true
				? `attachment; filename=${file.filename}`
				: 'inline',
		'Cache-Control': 'private, max-age=31536000',
	});

	bucket.openDownloadStream(req.query.id).pipe(res);
};

const mongoFiles = (config) => {
	const { formDataFileAttribute, bucketName, gridFS } = config;
	GridFSBucket = config.GridFSBucket;
	db = config.db;

	const _gridFS = typeof gridFS !== 'undefined' ? gridFS : true;
	const _bucketName = bucketName ? bucketName : 'FS';
	let bucket = null;

	makeDirIfNotExists(TEMP_FOLDER_PATH);

	/*
		gridFS enabled -> create a gridFS bucket
		grifFS disable -> create a mongo collection
	*/
	const createBucket = _gridFS ? createGridFSBucket : createMongoCollection;
	if (Buckets[_bucketName]) {
		bucket = Buckets[_bucketName];
	} else {
		bucket = createBucket(_bucketName);
		Buckets[_bucketName] = bucket;
	}

	return [
		(req) =>
			getFileOnServer(req, {
				_gridFS,
				bucket,
				generateFileId: config.generateFileId,
			}),
		(req, res) => downloadFile(req, res, { bucket }),
	];
};

const meteorMongoFiles = (config) => {
	const db = global.MongoInternals.defaultRemoteCollectionDriver().mongo.db;
	const GridFSBucket =
		global.MongoInternals.NpmModules.mongodb.module.GridFSBucket;

	if (!db) {
		throw new Error(
			'Meteor MongoDB instance not found, please provide it as "db" param name'
		);
	}

	if (!GridFSBucket) {
		throw new Error('Your MongoDB version is not compatible with GridFS');
	}

	if (!Random) {
		throw new Error(
			'Meteor Random module was not found, please provide a function that generate and id as a "generateFileId" param name'
		);
	}

	return mongoFiles({
		db,
		GridFSBucket,
		generateFileId: () => Random.id(),
		...config,
	});
};

export { meteorMongoFiles, Buckets };
