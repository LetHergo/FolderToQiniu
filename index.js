import qiniu from 'qiniu'
import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import 'dotenv/config.js'

// 鉴权
const mac = new qiniu.auth.digest.Mac(
	process.env.AccessKey,
	process.env.SecretKey
)
const BucketName = process.env.BucketName
const options = {
	scope: BucketName,
		'{"key": $(key), "hash": $(etag), "width": $(imageInfo.width), "height": $(imageInfo.height)}',
}
const putPolicy = new qiniu.rs.PutPolicy(options)
const uploadToken = putPolicy.uploadToken(mac)
const config = new qiniu.conf.Config()
config.zone = qiniu.zone.Zone_z2
// 初始化七牛云SDK
const formUploader = new qiniu.form_up.FormUploader(config)
const putExtra = new qiniu.form_up.PutExtra()

/**
 * 上传文件到七牛云。
 * https://developer.qiniu.com/kodo/1289/nodejs#simple-uptoken
 * @param {string} localFile 本地文件路径
 * @param {string} key 上传到七牛云的文件名
 * @returns {Promise<Object>} 包含上传成功后的文件信息的对象
 */
async function uploadToQiniu(localFile, key) {
	return new Promise((resolve, reject) => {
		formUploader.putFile(
			uploadToken,
			key,
			localFile,
			putExtra,
			(err, body, info) => {
				if (err) {
					reject(err)
				} else if (info.statusCode !== 200) {
					reject(new Error(`Failed to upload ${localFile}: ${body.error}`))
				} else {
					resolve(body)
				}
			}
		)
	})
}
 
/**
 * 递归遍历指定目录，并返回该目录下的所有图片文件。
 * @param {string} dirPath 目录路径
 * @param {Array<string>} fileList 文件列表
 */
function traverseDir(dirPath, fileList = []) {
	const files = fs.readdirSync(dirPath)
	files.forEach((file) => {
		const filePath = path.join(dirPath, file)
		const stat = fs.statSync(filePath)
		if (stat.isDirectory()) {
			traverseDir(filePath, fileList)
		} else if (/\.(jpg|jpeg|png|gif)$/i.test(filePath)) {
			fileList.push(filePath)
		}
	})
	return fileList
}

/**
 * 上传指定路径下的所有图片文件到七牛云，并输出上传前后时间对比信息。
 * @param {string} dirPath 目录路径
 */
async function uploadImagesToQiniu(dirPath) {
	const startTime = new Date()
	const fileList = traverseDir(dirPath)
	console.log(`Found ${fileList.length} image files in ${dirPath}.`)

	for (const filePath of fileList) {
		const fileKey = path.basename(filePath)
		try {
			await uploadToQiniu(filePath, fileKey)
			console.log(`Uploaded file "${fileKey}".`)
		} catch (err) {
			console.error(`Failed uploadToQiniu "${fileKey}": ${err.message}`)
		}
	}

	const endTime = new Date()
	const timeDiff = endTime.getTime() - startTime.getTime()
	console.log(`All files uploaded in ${timeDiff / 1000}s.`)
}

// 定义一个命令行交互式问题列表
const questions = [
	{
		type: 'input',
		name: 'dirpath',
		message: '输入文件夹地址来上传图片至七牛云存储:',
		validate: (input) => {
			const dirPath = input.trim()
			if (!fs.existsSync(dirPath)) {
				return `"${dirPath}" 该路径不存在 请输入一个正确的文件夹路径.`
			}
			if (!fs.statSync(dirPath).isDirectory()) {
				return `"${dirPath}" 类型错误  请输入一个正确的文件夹路径.`
			}
			return true
		},
	},
]

// 使用inquirer模块进行命令行交互
inquirer
	.prompt(questions)
	.then((answers) => {
		const dirPath = answers.dirpath.trim()
		if (!fs.existsSync(dirPath)) {
			console.error(`"${dirPath}" 该路径不存在 请输入一个正确的文件夹路径.`)
			return
		}
		if (!fs.statSync(dirPath).isDirectory()) {
			console.error(`"${dirPath}" 类型错误  请输入一个正确的文件夹路径.`)
			return
		}
		uploadImagesToQiniu(dirPath)
	})
	.catch((error) => {
		console.log('error', error)
	})

// 监听未处理的异常
process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception:', err)
	process.exit(1)
})

// 监听未处理的Promise rejection
process.on('unhandledRejection', (err) => {
	console.error('Unhandled Rejection:', err)
	process.exit(1)
})
