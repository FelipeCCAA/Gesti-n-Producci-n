from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def prueba(request):

    return Response({
        "mensaje":"Django conectado correctamente"
    })