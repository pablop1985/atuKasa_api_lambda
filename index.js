const {
	Pool,
	Client
} = require('pg');

const {
	Carrito,
	Venta,
	Cliente,
	Redsys
} = require('atukasa');

const AWS = require('aws-sdk');
const region = "eu-central-1";
const secretName = "atukasa";

var awsclient = new AWS.SecretsManager({
	region: region
});
var sqs = new AWS.SQS({
	region: region
});
const colaSQS = "https://sqs.eu-central-1.amazonaws.com/XXXXXXX/colaSocketAtukasa";

const convert = require('xml-js');


exports.handler = async(event, context) => {

	const promiseInfo = new Promise(async function(resolve, reject) {
		await awsclient.getSecretValue({
			SecretId: secretName
		}, async(err, data) => {
			if (err) {
				console.log(err);
				if (err.code === 'DecryptionFailureException')
					throw err;
				else if (err.code === 'InternalServiceErrorException')
					throw err;
				else if (err.code === 'InvalidParameterException')
					throw err;
				else if (err.code === 'InvalidRequestException')
					throw err;
				else if (err.code === 'ResourceNotFoundException')
					throw err;

				reject();
			} else {
				if ('SecretString' in data) {
					let secret = data.SecretString;

					resolve(secret);

				} else {
					let buff = new Buffer(data.SecretBinary, 'base64');
					let decodedBinarySecret = buff.toString('ascii');

					resolve(decodedBinarySecret);
				}
			}
		});
	});

	let secret = JSON.parse(await promiseInfo);

	var pool = new Pool({
		user: secret.username,
		host: secret.host,
		database: secret.dbname,
		password: secret.password,
		port: secret.port
	});

	const DB = await pool.connect();

	let response = {
		statusCode: 200,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*"
		},
		body: {}
	};

	let vuelta = {
		estado: 0,
		texto: 'Funcion desconocida',
		codigo: 0,
		componente: '',
		funcion: '',
		datos: [],
		lambda: context.functionVersion,
		version: event.stageVariables.vapi
	};

	let request = {};

	const promise = new Promise(async function(resolve, reject) {
		try {

			if (event.headers.soapaction !== undefined) {
				request = {
					redsys: JSON.parse(convert.xml2json(event.body, {
						compact: true,
						spaces: 4
					}))
				};
			} else {
				request = JSON.parse(event.body);
			}


			console.log(request);


			if (request.aparato !== undefined && request.componente !== undefined && request.funcion !== undefined) {

				if (request.idioma === undefined) {
					request.idioma = 1;
				}

				if (request.token && request.key) {

					let cliente = new Cliente(request.token, request.key, request.aparato, request.idioma, DB);

					await cliente.comprobar().then(async res => {
						if (res.estado == 1) {
							switch (request.componente) {
								case 'cliente':
									switch (request.funcion) {
										case 'comprobar':
											var carrito = new Carrito(cliente.datos.id, request.aparato, request.idioma, DB);
											await carrito.listar().then(resultado => {
												res.carrito = resultado;
											});
											vuelta = res;
											break;
										case 'editar':
											await cliente.editar(request.parametros).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'listarDirecciones':
											await cliente.listarDirecciones().then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'anadirDireccion':
											await cliente.anadirDireccion(request.parametros).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'editarDireccion':
											await cliente.editarDireccion(request.parametros).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'borrarDireccion':
											await cliente.borrarDireccion(request.parametros.id).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'listarVentas':
											await cliente.listarVentas(request.parametros).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'verDetallesVenta':
											await cliente.verDetallesVenta(request.parametros.venta).then(resultado => {
												vuelta = resultado;
											});
											break;
										default:
											break;
									}
									break;

								case 'carrito':
									var carrito = new Carrito(cliente.datos.id, request.aparato, request.idioma, DB);

									switch (request.funcion) {
										case 'anadir':
											await carrito.anadir_multiple(request.parametros.carrito_anadir).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'editar':
											await carrito.editar(request.parametros.id, request.parametros.unidades).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'borrar':
											await carrito.borrar(request.parametros.id).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'descartar':
											await carrito.descartar().then(resultado => {
												vuelta = resultado;
											});
											break;
										default:
											await carrito.listar().then(resultado => {
												vuelta = resultado;
											});
									}
									break;

								case 'venta':

									var venta = new Venta(request.parametros.venta ? request.parametros.venta : 0, cliente.datos.id, request.aparato, request.idioma, DB);

									switch (request.funcion) {
										case 'crear':
											await venta.crear(request.parametros.detalles).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'listarDirecciones':
											await venta.listarDirecciones().then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'listarRepartos':
											await venta.listarRepartos().then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'asignarReparto':
											await venta.asignarReparto(request.parametros.reparto, request.parametros.direccion, request.parametros.texto).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'resumen':
											await venta.resumen(request.parametros.confirmar ? true : false).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'pagar':
											await venta.pagar(request.parametros.metodo, request.parametros.estado, cliente).then(resultado => {
												vuelta = resultado;
											});
											break;
										case 'descartar':
											await venta.descartar().then(resultado => {
												vuelta = resultado;
											});
											break;
										default:

									}
									break;
								default:
							}
						} else {
							vuelta.texto = "USUARIO NO REGISTRADO";
						}
					});
				} else {

					if (request.componente == 'cliente') {
						let cliente = new Cliente('', request.key, request.aparato, request.idioma, DB);
						switch (request.funcion) {
							case 'login':
								vuelta = await cliente.login(request.parametros.email, request.parametros.contrasena);
								var carrito = new Carrito(cliente.datos.id, request.aparato, request.idioma, DB);
								await carrito.listar().then(resultado => {
									vuelta.carrito = resultado;
								});
								break;
							case 'validarAlta':
								vuelta = await cliente.validarAlta(request.parametros.clave);
								var carrito = new Carrito(cliente.datos.id, request.aparato, request.idioma, DB);
								await carrito.listar().then(resultado => {
									vuelta.carrito = resultado;
								});
								break;
							case 'registro':
								vuelta = await cliente.registro(request.parametros);
								break;
							case 'recuperarContrasena':
								vuelta = await cliente.recuperarContrasena(request.parametros);
								break;
							case 'validarRecuperacion':
								vuelta = await cliente.validarRecuperacion(request.parametros.clave);
								var carrito = new Carrito(cliente.datos.id, request.aparato, request.idioma, DB);
								await carrito.listar().then(resultado => {
									vuelta.carrito = resultado;
								});
								break;
							default:
								vuelta.texto = "USUARIO NO REGISTRADO";
						}
					} else {
						vuelta.texto = "USUARIO NO REGISTRADO";
					}
				}

				if (vuelta.sqs !== undefined) {
					console.log(vuelta.sqs);
					let parametrosSQS = {
						MessageBody: JSON.stringify(vuelta.sqs),
						QueueUrl: colaSQS
					}
					await sqs.sendMessage(parametrosSQS, async function(err, data) {
						if (err) {
							console.log("Error enviando SQS: " + err);
							vuelta.sqs = "Error enviando SQS: " + err;
						} else {
							console.log("SQS enviado con id: " + data.MessageId)
							vuelta.sqs = "SQS enviado con id: " + data.MessageId;
						}
					});

				}

				response.body = JSON.stringify(vuelta);

			} else {

				if (request.redsys !== undefined) {
					let json = request.redsys;
					/*console.log(json);
					console.log(json["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["ns1:procesaNotificacionSIS"]);*/
					let redsys = new Redsys();
					let message_xml = json["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["ns1:procesaNotificacionSIS"]["XML"]["_cdata"];
					console.log(message_xml);
					let dat = JSON.parse(convert.xml2json(json["SOAP-ENV:Envelope"]["SOAP-ENV:Body"]["ns1:procesaNotificacionSIS"]["XML"]["_cdata"], {
						compact: true,
						spaces: 4
					}));
					console.log(dat);
					let data = dat.Message;
					let idVenta = parseInt(data.Request.Ds_Order._text);

					var cliente = new Cliente('', '', 0, 0, DB)
					var venta = new Venta(idVenta, 0, 0, 0, DB);

					let consulta = {
						text: "SELECT amp.* FROM aparatos_metodos_pagos amp INNER JOIN ventas v ON v.aparato = amp.aparato AND amp.metodo_pago = 1 AND v.id = $1",
						values: [idVenta]
					}

					await DB.query(consulta).then(async(res) => {
						let respuesta = {};
						venta.datos_redsys = JSON.parse(res.rows[0].configuracion);
						venta.redsys = redsys;
						let fventa = async function(venta) {
							return new Promise(async function(resolve, reject) {
								//resolve(await venta.pagoRedsys(json, data, datos_redsys, message_xml, cliente, redsys, DB));

								let vuelta = Object.assign({}, venta.resultadobase);

								let key = venta.datos_redsys.CLAVE;
								let datos_venta = {};
								let id_venta = venta.id;

								// REDSYS VALIDACION
								let consulta = {
									text: "SELECT * FROM vista_datos_venta WHERE id = $1 AND estado = 1",
									values: [id_venta]
								};

								let firmaRespuestaOK = venta.redsys.createMerchantSignatureNotifSOAPResponse(key, "<Response Ds_Version='0.0'><Ds_Response_Merchant>OK</Ds_Response_Merchant></Response>", data.Request.Ds_Order._text);
								let firmaRespuestaKO = venta.redsys.createMerchantSignatureNotifSOAPResponse(key, "<Response Ds_Version='0.0'><Ds_Response_Merchant>OK</Ds_Response_Merchant></Response>", data.Request.Ds_Order._text);

								let ko = "<Message><Response Ds_Version='0.0'><Ds_Response_Merchant>KO</Ds_Response_Merchant></Response><Signature>" + firmaRespuestaKO + "</Signature></Message>";
								let ok = "<Message><Response Ds_Version='0.0'><Ds_Response_Merchant>OK</Ds_Response_Merchant></Response><Signature>" + firmaRespuestaOK + "</Signature></Message>";

								await DB.query(consulta).then(async(res2) => {
									datos_venta = res2.rows[0];
									venta.cliente = datos_venta.cliente;
									venta.aparato = datos_venta.aparato;
									cliente.datos.id = datos_venta.cliente;
									cliente.aparato = datos_venta.aparato;

									cliente.cargarDatos();

									message_xml = message_xml.replace('<Message>', '').replace('</Message>', '');
									message_xml = message_xml.slice(0, message_xml.indexOf('<Signature>'));

									let firma = venta.redsys.createMerchantSignatureNotifSOAPRequest(key, data.Request.Ds_Order._text, message_xml);
									console.log(firma);
									console.log(data.Signature._text);

									if (firma == data.Signature._text) {
										console.log("FIRMAS VALIDAS");
										if (data.Request.Ds_Response._text == '0000') {

											console.log("PAGO OK");

											//PAGAR VENTA
											await venta.pagar(1, true, cliente).then((estadoPago) => {
												if (estadoPago.estado == 1) {
													console.log("PAGO CORRECTO");
													vuelta = ok;
													resolve(vuelta);
												} else {
													console.log("PAGO FALLIDO");
													vuelta = ko;
													resolve(vuelta);
												}
											});
										} else {
											//CANCELAR PAGO
											console.log("PAGO KO");
											let final = await venta.pagar(1, false, cliente);
											if (final.estado == 1) {
												console.log("CANCELACION PAGO OK");
												vuelta = ko;
												resolve(vuelta);
											} else {
												console.log("CANCELACION PAGO FALLIDA");
												vuelta = ko;
												resolve(vuelta);
											}
										}
										// SI FIRMAS REDSYS NO COINCIDEN
									} else {
										vuelta = ko;
										reject(vuelta);
									}
								}).catch((err) => {
									vuelta = ko;
									reject(vuelta);
								});
							});
						}

						respuesta.body = await fventa(venta);

						respuesta.headers = {
							'Content-Type': 'application/soap+xml; charset=utf-8',
							'Access-Control-Allow-Origin': '*'
						};
						respuesta.statusCode = 200;
						response.body = JSON.stringify(respuesta);
					}).catch((err) => {
						console.log("Llamada redsys erronea, error + parametros: " + err);
						console.log(event);
						console.log(context);
						response.body = JSON.stringify(vuelta);
					});

				} else {
					console.log("Llamada desconocida, parámetros:");
					console.log(event);
					console.log(context);
					response.body = JSON.stringify(vuelta);
				}
			}

			DB.release();

			console.log(response);
			//callback(null, response);

			resolve(response);


		} catch (error) {

			console.log("ERROR PROCESANDO SOLICITUD: " + error);

			console.log(event);
			console.log(context);

			response.statusCode = 500;

			DB.release();

			resolve(response);
		}
	});

	return await promise;
};