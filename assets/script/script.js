document.addEventListener("DOMContentLoaded", () => {
    const botaoCompartilhar = document.getElementById("botaoCompartilhar");
    const cartaoNoticia = document.getElementById("cartaoNoticia");

    if (!botaoCompartilhar || !cartaoNoticia) return;

    botaoCompartilhar.addEventListener("click", async () => {
        const icone = botaoCompartilhar.querySelector('img');
        icone.src = "assets/img/progress_activity.svg";
        botaoCompartilhar.disabled = true;

        try {
            // Gera o canvas mantendo configurações otimizadas para redes sociais
            const canvasCartao = await html2canvas(cartaoNoticia, {
                useCORS: true,
                scale: 2,
                backgroundColor: "#ffffff",
                onclone: (documentoClonado) => {
                    const cartaoClonado = documentoClonado.getElementById("cartaoNoticia");
                    if (cartaoClonado) {
                        cartaoClonado.style.display = "flex";
                    }
                }
            });

            // Converte o canvas para um formato de arquivo legível para compartilhamento
            canvasCartao.toBlob(async (arquivoBlob) => {
                if (!arquivoBlob) {
                    throw new Error("Falha na geração do arquivo.");
                }

                const arquivoImagem = new File(
                    [arquivoBlob],
                    "noticia_criciuma.png",
                    { type: "image/png" }
                );

                // Verifica se o navegador atual suporta compartilhamento de arquivos via Web Share API
                if (navigator.canShare && navigator.canShare({ files: [arquivoImagem] })) {
                    await navigator.share({
                        title: "Dia do Professor em Criciúma",
                        files: [arquivoImagem]
                    });
                } else {
                    // Fallback para navegadores desktop ou que não suportam envio de arquivos nativo
                    const desejaBaixarImagem = confirm("O compartilhamento direto não é suportado neste navegador. Deseja baixar o cartão gerado?");
                    
                    if (desejaBaixarImagem) {
                        const linkBaixar = document.createElement("a");
                        linkBaixar.href = URL.createObjectURL(arquivoBlob);
                        linkBaixar.download = "/noticia_criciuma.png";
                        linkBaixar.click();
                    }
                }
            }, "image/png");

        } catch (erroGeral) {
            console.error("Erro durante o processo de geração do cartão:", erroGeral);
            alert("Não foi possível gerar a imagem para compartilhamento.");
        } finally {
            icone.src = 'assets/img/share.svg';
            botaoCompartilhar.disabled = false;
        }
    });
});

/**
 * Cache centralizado de elementos do DOM (Evita pesquisas repetidas e melhora a performance)
 */
const UI = {
	texto: document.getElementById("texto"),
	playButton: document.getElementById("playButton"),
	restartButton: document.getElementById("restartButton"),
	progressBar: document.getElementById("progressBar"),
	noticiaContainer: document.getElementById("noticiaUnicaContainer"),
	avisoLeitura: document.querySelector(".aviso-leitura"),
	swiperParallax: document.querySelector(".swiper-noticia-parallax"),
	body: document.body
};

/**
 * Módulo de Texto para Voz (Speech Synthesis API) com DOM Walker e Scroll Inteligente
 */
const LeitorDeVoz = (() => {
	let chunksDeDOM = [];
	let indiceChunkAtual = 0;
	let tamanhoTotalTexto = 0;
	let tamanhoConcluido = 0;

	// Nossa própria Fonte de Verdade (Contorna o bug de estado do Chrome)
	let estadoAudio = "parado"; // "parado", "tocando", "pausado"

	// Variáveis do Detector de Intenção de Scroll
	let usuarioAssumiuControle = false;
	let temporizadorScroll = null;

	const atualizarBotao = (icone) => {
		if (UI.playButton) UI.playButton.textContent = icone;
	};

	const escaparHTML = (str) => {
		return str.replace(/[&<>'"]/g, tag => ({
			'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
		}[tag] || tag));
	};

	const restaurarTextoAtual = () => {
		if (chunksDeDOM[indiceChunkAtual]) {
			const chunk = chunksDeDOM[indiceChunkAtual];
			chunk.elemento.innerHTML = chunk.htmlOriginal;
		}
	};

	const reiniciarAudio = () => {
		estadoAudio = "parado"; // Atualiza o nosso estado primeiro
		window.speechSynthesis.cancel();
		restaurarTextoAtual(); 
		indiceChunkAtual = 0;
		tamanhoConcluido = 0;
		chunksDeDOM = [];

		if (UI.progressBar) UI.progressBar.style.width = "0%";
		atualizarBotao("play_circle");
		UI.restartButton?.classList.remove("active");
	};

	const pausarAutoscroll = () => {
		usuarioAssumiuControle = true;
		clearTimeout(temporizadorScroll);
		
		temporizadorScroll = setTimeout(() => {
			usuarioAssumiuControle = false;
		}, 3000);
	};

	const destacarEScrollar = (chunk, charIndex) => {
		let fimPalavra = chunk.textoBruto.indexOf(' ', charIndex);
		if (fimPalavra === -1) fimPalavra = chunk.textoBruto.length;

		const antes = escaparHTML(chunk.textoBruto.substring(0, charIndex));
		const palavra = escaparHTML(chunk.textoBruto.substring(charIndex, fimPalavra));
		const depois = escaparHTML(chunk.textoBruto.substring(fimPalavra));

		chunk.elemento.innerHTML = `${antes}<mark id="palavra-ativa" style="background-color: #ffeb3b; color: #000; border-radius: 4px; box-shadow: 0 0 0 2px #ffeb3b;">${palavra}</mark>${depois}`;

		const marca = document.getElementById("palavra-ativa");
		
		if (marca && !usuarioAssumiuControle) {
			const rect = marca.getBoundingClientRect();
			const alturaJanela = window.innerHeight;

			if (rect.bottom > alturaJanela * 0.7 || rect.top < alturaJanela * 0.1) {
				const topAbsoluto = window.scrollY + rect.top;
				const posicaoCentro = topAbsoluto - (alturaJanela / 2) + (rect.height / 2);

				window.scrollTo({
					top: posicaoCentro,
					behavior: "smooth"
				});
			}
		}
	};

	const tocarProximoChunk = () => {
		// Proteção caso a fila tente avançar após o utilizador clicar em reiniciar
		if (estadoAudio === "parado") return; 

		if (indiceChunkAtual >= chunksDeDOM.length) {
			reiniciarAudio();
			return;
		}

		const chunk = chunksDeDOM[indiceChunkAtual];
		const enunciando = new SpeechSynthesisUtterance(chunk.textoBruto);
		enunciando.lang = "pt-BR";

		enunciando.onboundary = (event) => {
			if (event.name === "word") {
				if (UI.progressBar) {
					const progresso = ((tamanhoConcluido + event.charIndex) / tamanhoTotalTexto) * 100;
					UI.progressBar.style.width = `${progresso}%`;
				}
				destacarEScrollar(chunk, event.charIndex);
			}
		};

		enunciando.onend = () => {
			// Escudo contra o evento "onend" fantasma que o Chrome dispara ao dar cancel()
			if (estadoAudio === "parado") return; 

			restaurarTextoAtual(); 
			tamanhoConcluido += chunk.textoBruto.length;
			indiceChunkAtual++;
			tocarProximoChunk();
		};

		window.speechSynthesis.speak(enunciando);
	};

	const processarLeitura = () => {
		if (estadoAudio === "pausado") {
			window.speechSynthesis.resume();
			estadoAudio = "tocando";
			atualizarBotao("pause_circle");
			return;
		}

		if (estadoAudio === "tocando") {
			window.speechSynthesis.pause();
			estadoAudio = "pausado";
			atualizarBotao("play_circle");
			return;
		}

		if (!UI.texto) return;

		// Garante que o motor nativo desbugou antes de iniciar do zero
		window.speechSynthesis.cancel();

		if (chunksDeDOM.length === 0) {
			const elementosRaw = Array.from(UI.texto.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li'));

			const elementosFiltrados = elementosRaw.filter(el => {
				if (el.closest('.tabela-wrapper, table')) return false;
				if (el.tagName === 'LI' && el.querySelector('p')) return false;
				if (el.textContent.trim().length === 0) return false;
				return true;
			});

			chunksDeDOM = elementosFiltrados.map(el => ({
				elemento: el,
				htmlOriginal: el.innerHTML,
				textoBruto: el.textContent.trim()
			}));

			tamanhoTotalTexto = chunksDeDOM.reduce((acc, curr) => acc + curr.textoBruto.length, 0);
		}

		if (chunksDeDOM.length === 0) return; 

		estadoAudio = "tocando";
		UI.restartButton?.classList.add("active");
		atualizarBotao("pause_circle");
		tocarProximoChunk();
	};

	const gerenciarEventosSistema = () => {
		// Realizamos APENAS o cancelamento ao sair da página fechando a aba ou mudando de link
		window.addEventListener("beforeunload", () => window.speechSynthesis.cancel());

		window.addEventListener("wheel", pausarAutoscroll, { passive: true });
		window.addEventListener("touchmove", pausarAutoscroll, { passive: true });
		window.addEventListener("keydown", (e) => {
			if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Space"].includes(e.code)) {
				pausarAutoscroll();
			}
		}, { passive: true });

		UI.playButton?.addEventListener("click", processarLeitura);
		UI.restartButton?.addEventListener("click", reiniciarAudio);
	};

	return {
		inicializar: () => {
			window.speechSynthesis.cancel();
			gerenciarEventosSistema();
		}
	};
})();

/**
 * Módulo de Auxílio Visual de Leitura (Régua)
 */
const AuxilioLeitura = (() => {
	let elementoAuxilio = null;
	let triangulo = null;
	let ativo = false;
	let animationFrameId = null;

	// Variáveis de estado do mouse para não travar o loop de renderização
	let mouseX = 0;
	let mouseY = 0;

	const renderizarRégua = () => {
		if (!ativo || !elementoAuxilio || !UI.texto) return;

		const rect = UI.texto.getBoundingClientRect();
		
		// Move a linha (baseado em posição fixa via CSS)
		elementoAuxilio.style.transform = `translate(-50%, ${mouseY}px)`;

		// Mantém o triângulo alinhado dentro dos limites do texto
		if (mouseX >= rect.left && mouseX <= rect.right) {
			triangulo.style.left = `${mouseX - rect.left}px`;
		}

		animationFrameId = requestAnimationFrame(renderizarRégua);
	};

	const atualizarCoordenadasMouse = (e) => {
		mouseX = e.clientX;
		mouseY = e.clientY;
	};

	const alternarRégua = () => {
		if (ativo) {
			// Desativar
			ativo = false;
			if (elementoAuxilio) elementoAuxilio.remove();
			UI.body.style.cursor = "unset";
			window.removeEventListener("mousemove", atualizarCoordenadasMouse);
			cancelAnimationFrame(animationFrameId);
			elementoAuxilio = null;
			triangulo = null;
		} else {
			// Ativar
			ativo = true;
			UI.body.insertAdjacentHTML('beforeend', '<div id="elementoAuxilioLeitura"><div class="triangulo"></div></div>');
			elementoAuxilio = document.getElementById("elementoAuxilioLeitura");
			triangulo = elementoAuxilio.querySelector(".triangulo");
			
			UI.body.style.cursor = "none";
			window.addEventListener("mousemove", atualizarCoordenadasMouse, { passive: true });
			
			// Inicia o motor de renderização fluida de 60 FPS
			animationFrameId = requestAnimationFrame(renderizarRégua);
		}
	};

	return {
		inicializar: () => {
			window.addEventListener("keydown", (evento) => {
				if (evento.key.toLowerCase() === "l") {
					alternarRégua();
				}
			});
		}
	};
})();

/**
 * Módulo de Layout, GSAP e Animações
 */
const LayoutInterativo = (() => {
	const iniciarAvisoLeitura = () => {
		if (!UI.noticiaContainer || !UI.avisoLeitura || typeof gsap === "undefined") return;

		const timelineAviso = gsap.timeline({
			scrollTrigger: {
				trigger: UI.avisoLeitura,
				start: "bottom bottom",
				end: () => {
					const alturaContainer = UI.noticiaContainer.offsetHeight;
					const alturaAviso = UI.avisoLeitura.offsetHeight;
					return `+=${Math.max(0, alturaContainer - alturaAviso)}`;
				},
				pin: true,
				pinSpacing: true,
				scrub: true,
				invalidateOnRefresh: true
			}
		});

		timelineAviso
			.to(UI.avisoLeitura, { opacity: 1, duration: 0.9 })
			.to(UI.avisoLeitura, { opacity: 0, duration: 0.1 });
	};

	const iniciarSwiper = () => {
		if (UI.swiperParallax && typeof Swiper === "function") {
			new Swiper(UI.swiperParallax, {
				speed: 800,
				parallax: true,
				loop: true,
				grabCursor: true,
				watchSlidesProgress: true,
				navigation: {
					nextEl: '.swiper-button-next',
					prevEl: '.swiper-button-prev',
				},
				pagination: {
					el: '.swiper-pagination',
					clickable: true,
					type: "fraction"
				},
			});
		}
	};

	return {
		inicializar: () => {
			iniciarAvisoLeitura();
			iniciarSwiper();
		}
	};
})();

/**
 * Orquestração de Inicialização
 */
document.addEventListener("DOMContentLoaded", () => {
	// Restaura o título vindo de variável global do PHP (caso exista de forma limpa)
	if (typeof tituloOriginal !== "undefined") {
		document.title = tituloOriginal;
	}

	LeitorDeVoz.inicializar();
	AuxilioLeitura.inicializar();
	LayoutInterativo.inicializar();
});

window.addEventListener("load", () => {
	if (typeof ScrollController !== "undefined" && typeof ScrollController.scrollTo === "function") {
		ScrollController.scrollTo("#conteudo");
	}
});